use crate::domain::IpExtractor;
use axum::http::HeaderMap;
use std::net::IpAddr;

pub struct ProxyAwareIpExtractor;

impl IpExtractor for ProxyAwareIpExtractor {
    fn extract(&self, headers: &HeaderMap) -> IpAddr {
        // Check X-Real-IP header (set by reverse proxy)
        if let Some(real_ip) = headers.get("x-real-ip") {
            if let Ok(ip_str) = real_ip.to_str() {
                if let Ok(ip) = ip_str.parse() {
                    return ip;
                }
            }
        }

        // Check X-Forwarded-For header (may contain multiple IPs)
        if let Some(forwarded_for) = headers.get("x-forwarded-for") {
            if let Ok(ip_str) = forwarded_for.to_str() {
                let first_ip = ip_str.split(',').next().unwrap_or("").trim();
                if let Ok(ip) = first_ip.parse() {
                    return ip;
                }
            }
        }

        // Fallback to localhost
        "127.0.0.1"
            .parse()
            .unwrap_or_else(|_| IpAddr::from([127, 0, 0, 1]))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_from_x_real_ip() {
        let extractor = ProxyAwareIpExtractor;
        let mut headers = HeaderMap::new();
        headers.insert("x-real-ip", "192.168.1.1".parse().unwrap());

        let ip = extractor.extract(&headers);
        assert_eq!(ip.to_string(), "192.168.1.1");
    }

    #[test]
    fn test_extract_from_x_forwarded_for() {
        let extractor = ProxyAwareIpExtractor;
        let mut headers = HeaderMap::new();
        headers.insert("x-forwarded-for", "10.0.0.1, 10.0.0.2".parse().unwrap());

        let ip = extractor.extract(&headers);
        assert_eq!(ip.to_string(), "10.0.0.1");
    }

    #[test]
    fn test_fallback_to_localhost() {
        let extractor = ProxyAwareIpExtractor;
        let headers = HeaderMap::new();

        let ip = extractor.extract(&headers);
        assert_eq!(ip.to_string(), "127.0.0.1");
    }
}
