# Memory Leak Analysis Report

## Summary
**Status**: One confirmed issue (frontend timer leak), rest of codebase is well-managed.

---

## Issues Found

### 1. ⚠️ CONFIRMED: Frontend Timer Leak (Medium Priority)
**Location**: `public/app.js`, lines 1635-1642
**Issue**: Two `setInterval` calls that never get cleared

```javascript
// Line 1635-1640: Event polling
setInterval(() => {
  if (!dom.modal.classList.contains('open')) {
    fetchEvents();
  }
}, POLL_INTERVAL_MS);

// Line 1642: Yearly event reset check
setInterval(checkAndResetYearlyEvents, 60000);
```

**Impact**: 
- These intervals continue running indefinitely for the lifetime of the SPA
- Each interval holds a reference to the callback function and any captured variables
- In long-lived browser sessions (users keeping tabs open), this can accumulate memory overhead

**Severity**: Medium (not a traditional leak since intervals die when page unloads, but wastes memory in long sessions)

**Recommendation**: 
Store interval IDs and provide cleanup on page unload or visibility change:
```javascript
let pollIntervalId = setInterval(() => { ... }, POLL_INTERVAL_MS);
let checkIntervalId = setInterval(checkAndResetYearlyEvents, 60000);

// Cleanup on visibility hidden
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    clearInterval(pollIntervalId);
    clearInterval(checkIntervalId);
  } else {
    // Restart intervals if needed
    pollIntervalId = setInterval(() => { ... }, POLL_INTERVAL_MS);
    checkIntervalId = setInterval(checkAndResetYearlyEvents, 60000);
  }
});
```

---

## Green Flags (Well-Managed Resources)

### Backend - Rust (Excellent)

✅ **Session Management**
- Sessions use Arc<Mutex<HashMap>> with periodic cleanup
- `prune_expired_sessions()` runs every 5 minutes (line 70 in main.rs)
- Expired sessions removed based on last_seen timestamp
- Sessions are persisted to disk atomically

✅ **File Repositories**
- `FileEventRepository`, `FileUserRepository`, etc. use proper resource cleanup
- `fs::read_to_string()` and `fs::write()` automatically close file handles
- Atomic writes using temp file + rename pattern (no dangling file handles)
- Mutex lock prevents concurrent file corruption

✅ **Background Tasks**
- Email notifications: runs every 6 hours, properly awaits, error handling with logs
- Backup manager: creates daily snapshots, has 30-day retention cleanup
- Session pruning: runs every 5 minutes with proper locking

✅ **Memory Collections**
- User repository: loaded into memory, persisted to disk (bounded by user count)
- Event repository: loaded into memory, persisted to disk (bounded by event count)
- All collections have explicit lifecycle management (load_all / save_all)
- No unbounded growth patterns detected

### Frontend - JavaScript (Good)

✅ **Event Listeners**
- Dynamic listeners added to elements are properly cleaned up when elements are removed
- Window listeners are intentionally persistent (normal for SPA)
- No listener-to-listener cycles detected

✅ **DOM Cleanup**
- Toasts: created and removed with `removeChild()` (line 139)
- Locale menu: cleared with `innerHTML = ''` (line 294)
- No detached DOM nodes accumulating

✅ **No Observable setTimeout/requestAnimationFrame Leaks**
- Toast timeouts are short-lived and complete
- Timers don't create circular references

---

## Recommendations

### Priority 1: Fix Timer Leak (Frontend)
- Implement interval cleanup on visibility change or page unload
- Store interval IDs globally or in state object
- Test with browser DevTools Memory Profiler

### Priority 2: Monitor Long Sessions (Observational)
- In production, monitor browser memory usage over 8+ hour sessions
- Consider reducing `POLL_INTERVAL_MS` if polling adds significant overhead
- Consider implementing a periodic page refresh mechanism (every 4-8 hours)

### Priority 3: Optional Future Hardening (Low Priority)
- Add max-session limits to prevent unbounded HashMap growth (e.g., max 10k sessions)
- Implement login attempt cleanup (currently persists to `data/login_attempts.json` but only grows)
- Add file rotation for audit logs to prevent unbounded growth

---

## Testing Memory Behavior

### Browser DevTools (Frontend)
1. Open DevTools → Memory tab
2. Take heap snapshot at app start
3. Use app for 30+ minutes, polling events
4. Take another heap snapshot
5. Compare: should see minimal growth (just from user data, not interval callbacks)

### Backend (via Logs)
- Check logs for `prune_expired_sessions` and `send_upcoming_notifications` frequency
- Verify `backup background task` completes without errors
- Monitor for "out of memory" or resource exhaustion errors

---

## Conclusion

The codebase is **memory-conscious** and well-designed:
- ✅ Rust backend: excellent resource management with proper cleanup
- ⚠️ JavaScript frontend: one timer leak issue, easily fixable
- ✅ File I/O: atomic writes, proper handle cleanup
- ✅ Collections: bounded by data volume, not by time

**Recommend**: Apply the frontend timer fix and monitor long sessions in production.
