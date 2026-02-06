# API Integration Checklist

## Adding New API Endpoints

When adding a new backend API endpoint, ALWAYS complete ALL of these steps:

### Backend
1. Add route in `backend/routes/*.js`
2. Add controller method in `backend/controllers/*.js`
3. Add service method in `backend/services/*.js` (if needed)
4. Add repository method in `backend/repositories/*.js` (if needed)

### Frontend
5. **CRITICAL**: Add endpoint constant to `frontend/src/config.js` in `API_ENDPOINTS`
6. Add API call function in `frontend/src/services/*.js` (if creating dedicated service)
7. Use the endpoint in the component

### Common Mistakes to Avoid
- ❌ Adding backend route but forgetting `frontend/src/config.js`
- ❌ Using hardcoded URLs instead of `API_ENDPOINTS` constants
- ❌ Assuming the endpoint works without testing the full flow

### Verification
Before considering an API feature complete:
- [ ] Backend route responds correctly (test with curl or browser)
- [ ] Frontend config has the endpoint defined
- [ ] Frontend component successfully calls the API
- [ ] Error handling works (network errors, 404s, 500s)

## Database Schema Changes

See `database-migrations.md` for full migration guidance, schema sync rules, and test database requirements.
