# Sample Fix for Critical Issue #1: Adding Auth to Event API
# This shows the pattern needed to secure the event endpoints

# --- FILE: src/features/events/handlers.rs ---
# Add this function to the EventHandlers struct:

pub async fn authenticate_request(&self, headers: &HeaderMap, role: UserRole) -> Result<crate::domain::User> {
    // This function should be implemented in AuthHandlers and passed to EventHandlers
    // For now, showing the pattern
    if let Some(cookie) = headers.get("cookie") {
        let cookie_str = cookie
            .to_str()
            .map_err(|_| crate::error::AppError::Unauthorized("Invalid cookie".to_string()))?;
        
        // Parse user_id from cookie
        for part in cookie_str.split(';') {
            let part = part.trim();
            if let Some(user_id) = part.strip_prefix("user_id=") {
                // Get user from repository
                // For now this is pseudo-code
                // let user = self.user_repo.find_by_id(user_id).await?;
                // return Ok(user);
            }
        }
    }
    Err(crate::error::AppError::Unauthorized("Not logged in".to_string()))
}

# --- Updated handlers with authentication ---

pub async fn list_events(&self, headers: &HeaderMap) -> Response {
    // BEFORE: let query = ListEventsQuery;
    
    // AFTER: Require authentication
    match self.authenticate_request(headers).await {
        Ok(_user) => {
            let query = ListEventsQuery;
            match self.service.list_events(query).await {
                Ok(result) => (StatusCode::OK, Json(result.events)).into_response(),
                Err(e) => e.into_response(),
            }
        }
        Err(e) => e.into_response(),
    }
}

pub async fn create_event(&self, headers: &HeaderMap, Json(payload): Json<CreateEventRequest>) -> Response {
    // Require admin role
    match self.authenticate_request(headers).await {
        Ok(user) => {
            if !user.is_admin() {
                return crate::error::AppError::Forbidden(
                    "Only admins can create events".to_string()
                ).into_response();
            }
            
            // ... rest of event creation logic
        }
        Err(e) => e.into_response(),
    }
}

pub async fn update_event(&self, headers: &HeaderMap, Path(id): Path<String>, Json(payload): Json<UpdateEventRequest>) -> Response {
    // Require admin role
    match self.authenticate_request(headers).await {
        Ok(user) => {
            if !user.is_admin() {
                return crate::error::AppError::Forbidden(
                    "Only admins can update events".to_string()
                ).into_response();
            }
            
            // ... rest of event update logic
        }
        Err(e) => e.into_response(),
    }
}

pub async fn delete_event(&self, headers: &HeaderMap, Path(id): Path<String>) -> Response {
    // Require admin role
    match self.authenticate_request(headers).await {
        Ok(user) => {
            if !user.is_admin() {
                return crate::error::AppError::Forbidden(
                    "Only admins can delete events".to_string()
                ).into_response();
            }
            
            // ... rest of event deletion logic
        }
        Err(e) => e.into_response(),
    }
}

# --- FILE: src/main.rs ---
# Update the router to pass headers:

let app = Router::new()
    // ... other routes ...
    .route(
        "/api/events",
        get(move |headers| {
            let e = events_clone1.clone();
            async move { e.list_events(&headers).await }
        })
        .post(move |headers, body| {
            let e = events_clone2.clone();
            async move { e.create_event(&headers, body).await }
        }),
    )
    .route(
        "/api/events/{id}",
        put(move |headers, Path(id), body| {
            let e = events_clone3.clone();
            async move { e.update_event(&headers, Path(id), body).await }
        })
        .delete(move |headers, Path(id)| {
            let e = events_clone4.clone();
            async move { e.delete_event(&headers, Path(id)).await }
        }),
    )
    // ... rest of routes ...

# --- FILE: Cargo.toml ---
# Add dependencies for fixing Critical Issues:

[dependencies]
# Existing...
governor = "0.10"  # For rate limiting (Issue #2)
parking_lot = "0.12"  # For file locking (Issue #3)
uuid = { version = "1.0", features = ["v4", "serde"] }  # For session IDs

# --- Quick Test After Implementing Fixes ---

# This should now FAIL (good - auth is working):
curl http://localhost:3000/api/events

# This should still work:
curl -X POST http://localhost:3000/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"password"}' \
  -c cookies.txt

# This should now WORK (with valid session):
curl http://localhost:3000/api/events \
  -b cookies.txt

# This should now FAIL (not admin):
curl http://localhost:3000/api/events \
  -X POST \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"title":"Test","date":"2026-01-01"}'
