use std::collections::HashMap;
use std::net::IpAddr;
use std::sync::Mutex;
use std::time::{Duration, Instant};

struct Entry {
    window: Instant,
    count: u32,
}

struct State {
    entries: HashMap<IpAddr, Entry>,
    last_cleanup: Instant,
}

pub struct RateLimiter {
    limit: u32,
    state: Mutex<State>,
}

impl RateLimiter {
    pub fn new(limit: u32) -> Self {
        Self {
            limit,
            state: Mutex::new(State {
                entries: HashMap::new(),
                last_cleanup: Instant::now(),
            }),
        }
    }

    pub fn limit(&self) -> u32 {
        self.limit
    }

    pub fn check(&self, ip: IpAddr) -> bool {
        let now = Instant::now();
        let mut state = self
            .state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());

        if now.duration_since(state.last_cleanup) >= Duration::from_secs(300) {
            state
                .entries
                .retain(|_, entry| now.duration_since(entry.window) < Duration::from_secs(120));
            state.last_cleanup = now;
        }

        if !state.entries.contains_key(&ip) && state.entries.len() >= 100_000 {
            return false;
        }

        let entry = state.entries.entry(ip).or_insert(Entry {
            window: now,
            count: 0,
        });
        if now.duration_since(entry.window) >= Duration::from_secs(60) {
            entry.window = now;
            entry.count = 0;
        }

        if entry.count >= self.limit {
            return false;
        }
        entry.count += 1;
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::Ipv4Addr;

    #[test]
    fn limits_per_address() {
        let limiter = RateLimiter::new(2);
        let first = IpAddr::V4(Ipv4Addr::new(192, 0, 2, 1));
        let second = IpAddr::V4(Ipv4Addr::new(192, 0, 2, 2));

        assert!(limiter.check(first));
        assert!(limiter.check(first));
        assert!(!limiter.check(first));
        assert!(limiter.check(second));
    }
}
