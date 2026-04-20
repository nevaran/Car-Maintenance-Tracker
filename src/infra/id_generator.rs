use crate::domain::IdGenerator;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::OnceLock;
use std::time::{SystemTime, UNIX_EPOCH};

pub struct TimestampIdGenerator;

impl IdGenerator for TimestampIdGenerator {
    fn generate(&self) -> String {
        static COUNTER: OnceLock<AtomicU64> = OnceLock::new();
        let counter = COUNTER.get_or_init(|| AtomicU64::new(0));
        
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis();
        
        let id = counter.fetch_add(1, Ordering::Relaxed);
        format!("{}-{}", timestamp, id)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_id_generation() {
        let gen = TimestampIdGenerator;
        let id1 = gen.generate();
        let id2 = gen.generate();
        
        assert!(!id1.is_empty());
        assert!(!id2.is_empty());
        assert_ne!(id1, id2);
    }
}
