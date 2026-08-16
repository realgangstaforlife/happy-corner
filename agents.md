# Happy Corner 🍭 - Complete Platform Documentation

**Version**: 1.0.0  
**Last Updated**: August 9, 2026  
**Status**: Production Ready  
**Owner**: Evan Lensen Mosquera

---

## 🎯 WHAT IS HAPPY CORNER?

Happy Corner is a **complete e-commerce + POS system** for a food and digital goods shop targeting university students at Instituto SENA Cali.

**Use Cases**:
- ☕ Physical storefront POS (Pizza, Snacks, Robux)
- 🛒 Online ordering (web pre-orders)
- 🎫 QR code order verification
- 💳 Digital gift cards (Robux)
- 📱 User accounts + credit system
- 📧 Email marketing campaigns
- ⭐ Customer reviews section
- 💝 Loyalty points (HappyScore)

**Location**: Instituto SENA Cali, Colombia  
**Target Users**: University students (14-25 years old)  
**Launch Date**: August 2026

---

## 🏗️ ARCHITECTURE OVERVIEW

```
┌─────────────────────────────────────────────────────┐
│             HAPPY CORNER PLATFORM                    │
├─────────────────────────────────────────────────────┤
│                                                       │
│  Frontend Layer (Client-Facing)                      │
│  ├─ login.html (Auth, Signup, Google Sign-In)       │
│  ├─ pos-v2.html (Point-of-Sale Terminal)            │
│  ├─ admin-v2.html (Admin Dashboard)                 │
│  ├─ mi-cuenta.html (User Account)                   │
│  ├─ verificar-pedido.html (QR Order Tracker)        │
│  ├─ factura.html (Invoice/Receipt)                  │
│  ├─ catalogo.html (Product Catalog)                 │
│  └─ reviews.html (Customer Reviews)                 │
│                                                       │
│  Backend Layer (API Server)                         │
│  ├─ api/account.js (Consolidated Router)            │
│  │   ├─ Auth actions (signup, login, password)      │
│  │   ├─ Email actions (welcome, bulk, confirmation) │
│  │   ├─ Admin actions (client management)           │
│  │   ├─ HappyCode actions (requests, approval)      │
│  │   └─ Marketing actions (campaigns)               │
│  ├─ api/checkDebtReminders.js (Debt notifications)  │
│  ├─ Other APIs (s.js, contract.js, etc.)            │
│  └─ Deployed on Vercel (Node.js runtime)            │
│                                                       │
│  Database Layer (Firestore)                         │
│  ├─ users (authentication, profiles, credits)       │
│  ├─ orders (transactions, status, items)            │
│  ├─ products (menu, robux, pricing)                 │
│  ├─ happycode_requests (code change workflow)       │
│  ├─ reviews (customer testimonials)                 │
│  └─ Hosted on Firebase (Google Cloud)               │
│                                                       │
│  Real-Time Features                                 │
│  ├─ Firestore Listeners (onSnapshot)                │
│  ├─ WebSockets (optional future)                    │
│  └─ Email Notifications (Resend)                    │
│                                                       │
│  Storage & CDN                                      │
│  ├─ R2 (Cloudflare, for images)                     │
│  ├─ Vercel CDN (frontend)                           │
│  └─ Firebase Storage (user uploads)                 │
│                                                       │
└─────────────────────────────────────────────────────┘
```

---

## 🔧 TECH STACK

### **Frontend**
```
- Vanilla JavaScript (no frameworks)
- HTML5 + CSS3
- Firebase SDK v10.12.0 (client)
- CapCut SDK (for video processing)
- html2pdf.js (invoice generation)
- Chart.js (analytics)
```

### **Backend**
```
- Node.js (runtime)
- Express-style routing (via api/account.js)
- Firebase Admin SDK (Firestore, Auth, Storage)
- Resend API (email delivery)
- Telegram Bot API (notifications)
```

### **Database**
```
- Firestore (primary NoSQL database)
- Firebase Auth (user authentication)
- Firebase Storage (file uploads)
- Cloudflare R2 (image CDN)
```

### **Deployment**
```
- Vercel (serverless functions, hosting)
- Firebase (database, auth, storage)
- GitHub (source control, CI/CD)
- Resend (email service)
- Cloudflare (R2 storage, DNS)
```

### **Services**
```
- Google Sign-In (OAuth)
- Nequi/Bancolombia APIs (payments, future)
- Telegram Bot API (admin notifications)
- Meta WhatsApp Cloud API (optional messaging)
```

---

## 📋 CORE FEATURES & FUNCTIONS

### **1. AUTHENTICATION SYSTEM**

#### Features:
- Email/Password signup & login
- Google Sign-In (auto-fill email)
- Password reset via email
- Account deletion
- Session management

#### Backend Functions:
```javascript
// In api/account.js
action=logLogin              // Log user login session
action=verifyOnboardingCode  // Verify email/phone OTP
action=sendPasswordReset     // Send password reset link
action=sendDeletePin         // Send account deletion PIN
action=deleteAccount         // Delete user account
```

#### Frontend Files:
- `login.html` - Auth interface
- `firebase-auth.js` - Firebase client library

#### Database:
- Collection: `users` (uid, email, name, provider, phone, etc.)
- Collection: `loginSessions` (activity tracking)

---

### **2. POINT-OF-SALE SYSTEM**

#### Features:
- Product selection (Pizza, Snacks, Robux)
- Dynamic pricing from Firestore
- Manual customer entry (no registration required)
- Credit/debt tracking
- Multiple payment methods (Cash, Nequi, Credit, Efectivo)
- Real-time inventory updates
- Robux category with dynamic prices

#### Backend Functions:
```javascript
// In api/account.js
action=getRecipients    // Fetch customers (for manual selection)
action=getUsersList     // Get all users
// Order creation via Firestore direct write
```

#### Frontend Files:
- `pos-v2.html` - POS terminal interface
- Real-time Firestore listeners for product updates

#### Database:
- Collection: `orders` (orderId, items, total, paymentMethod, status)
- Collection: `products` (sku, price, category, active status)
- Sub-collection: `users.debts` (credit tracking)

---

### **3. ORDER TRACKING (QR SCANNER)**

#### Features:
- QR code per order
- Scan to verify order status
- Real-time status updates (Pending → Preparing → Ready → Delivered)
- Privacy: Show truncated customer name unless logged in
- Full details for order owner or admin

#### Backend Functions:
```javascript
// Firestore Listeners (real-time)
// onSnapshot(orders collection, filter by orderId)
```

#### Frontend Files:
- `verificar-pedido.html` - QR scanner page
- Real-time status display

#### Database:
- Collection: `orders` (status field: pending, preparing, ready, delivered)

---

### **4. ADMIN DASHBOARD**

#### Features:
- Analytics (Chart.js dashboards)
- Customer management (create clients, view debt)
- Product management (add, edit, delete items)
- Robux pricing panel (dynamic management)
- Order management (view, mark ready, complete)
- HappyCode request approval workflow
- Email marketing campaigns (bulk send)
- Review management (approve/reject user reviews)

#### Backend Functions:
```javascript
// In api/account.js
action=adminCreateClient        // Create customer account
action=adminSendPasswordReset   // Send reset to customer
action=updateContractText       // Update contract template
action=uploadMarketingImage     // Upload campaign images
action=sendMarketingEmail       // Send bulk campaigns
action=getRecipients            // Filter customers
action=sendBulk                 // Bulk email send
action=listHappyCodeRequests    // View pending codes
action=approveHappyCodeChange   // Approve code change
action=rejectHappyCodeChange    // Reject code change
```

#### Frontend Files:
- `admin-v2.html` - Admin dashboard
- Multiple tabs: Analytics, Products, Orders, Robux, Emails, HappyCode, Reviews

#### Database:
- Collection: `users` (admin role verification)
- Collection: `orders` (admin filtering)
- Collection: `products` (CRUD)
- Collection: `happycode_requests` (workflow)
- Collection: `reviews` (approval status)

---

### **5. EMAIL SYSTEM**

#### Features:
- Welcome emails on signup
- Bulk marketing campaigns with templates
- Order confirmation emails
- HappyCode approval/rejection notifications
- Debt reminder emails
- Password reset emails

#### Backend Functions:
```javascript
// In api/account.js
action=sendWelcomeEmail          // New user welcome
action=sendBulk                  // Marketing campaigns
action=sendOrderConfirmationEmail // Order receipt (NEW)
action=approveHappyCodeChange    // Approval notification
action=rejectHappyCodeChange     // Rejection notification

// Scheduled
api/checkDebtReminders.js        // Nightly debt reminders
```

#### Email Provider:
- **Resend API** for sending
- Sender domain: `noreply@alertas.happycorner.top`
- Templates: Professional HTML with Happy Corner branding

#### Database:
- Collection: `users` (email field, emailOptIn, marketingOptIn)
- Collection: `emailLogs` (optional, audit trail)

---

### **6. HAPPYCODE SYSTEM** (User Loyalty Codes)

#### Features:
- Unique code per user (for tracking purchases)
- User can request code change
- Admin approval workflow
- "Wow increíble" email on approval
- Prevents duplicate codes

#### Backend Functions:
```javascript
// In api/account.js
action=requestHappyCodeChange   // User submits request
action=listHappyCodeRequests    // Admin views pending
action=approveHappyCodeChange   // Admin approves → email sent
action=rejectHappyCodeChange    // Admin rejects → email sent
```

#### Frontend Files:
- `mi-cuenta.html` - User can request change
- `admin-v2.html` - Admin approval tab

#### Database:
- Collection: `users` (happycode field)
- Collection: `happycode_requests` (uid, currentCode, newCode, status, createdAt)

---

### **7. REVIEWS SYSTEM** (Only Real Reviews)

#### Features:
- Customers can submit reviews after purchase
- Star rating (1-5)
- Title + detailed content
- Verification: Must link to real order
- Admin approval workflow
- Public display: Only approved reviews
- Privacy: Anonymous display (first name + last initial only)

#### Backend Functions:
```javascript
// Firestore rules verify:
// - User has real orders
// - Review content > 10 chars
// - Rating is 1-5
// - Only show status=approved
```

#### Frontend Files:
- `mi-cuenta.html` - Review submission form
- `reviews-admin.html` - Admin approval panel (NEW)
- `reviews.html` - Public review display (NEW)

#### Database:
- Collection: `reviews` (uid, userName, rating, title, content, orderIds, verified, status, createdAt)
- Firestore rules: Only read approved reviews publicly

---

### **8. INVOICING SYSTEM**

#### Features:
- Dynamic invoice generation from order data
- Professional thermal receipt design
- Customer name truncation (privacy)
- Print-friendly styling
- PDF export via html2pdf

#### Frontend Files:
- `factura.html` - Invoice viewer/printer
- Query param: `?orderId=ABC123`

#### Backend:
- No API needed (reads directly from Firestore)

#### Database:
- Collection: `orders` (used to populate invoice)

---

### **9. ROBUX MANAGEMENT**

#### Features:
- Dynamic Robux products from Firestore
- Real-time price updates (via onSnapshot)
- Admin can add/edit/delete Robux
- Prices instantly reflect in POS (no refresh)
- Separate pricing for each denomination

#### Backend Functions:
```javascript
// Firestore Listeners (real-time)
// Admin CRUD via Firestore direct writes
```

#### Frontend Files:
- `pos-v2.html` - Robux category filter + real-time listening
- `admin-v2.html` - Robux management panel

#### Database:
- Collection: `products` (category='robux', denomination, price, active)

---

### **10. USER ACCOUNTS**

#### Features:
- Profile viewing & editing
- HappyScore tracking (loyalty points)
- Debt/credit balance
- Order history
- HappyCode management
- Password change
- Account deletion

#### Frontend Files:
- `mi-cuenta.html` - User account dashboard

#### Database:
- Collection: `users` (all account data)
- Sub-collection: `users/{uid}/orderHistory`

---

## 📊 DATABASE SCHEMA

### **Collection: users**
```json
{
  "uid": "string",
  "email": "string",
  "name": "string",
  "displayName": "string",
  "phone": "string",
  "provider": "password|google",
  "photoURL": "string",
  "role": "user|admin",
  "happycode": "string",
  "happyscore": "number",
  "activeDebt": "number",
  "debtStatus": "clear|warning|overdue",
  "customerCode": "string",
  "contractSigned": "boolean",
  "contractVersion": "number",
  "emailOptIn": "boolean",
  "marketingOptIn": "boolean",
  "boughtRobux": "boolean",
  "lastOrderDate": "timestamp",
  "createdAt": "timestamp",
  "updatedAt": "timestamp"
}
```

### **Collection: orders**
```json
{
  "orderId": "string",
  "customerUID": "string|null",
  "customerName": "string",
  "customerPhone": "string",
  "customerEmail": "string",
  "status": "pending|preparing|ready|delivered|cancelled",
  "paymentMethod": "Nequi|Bancolombia|Tarjeta|Efectivo|Crédito",
  "items": [
    {
      "sku": "string",
      "name": "string",
      "quantity": "number",
      "price": "number"
    }
  ],
  "total": "number",
  "resumen": "string",
  "isManualEntry": "boolean",
  "timestamp": "timestamp",
  "createdAt": "timestamp",
  "updatedAt": "timestamp"
}
```

### **Collection: products**
```json
{
  "sku": "string",
  "name": "string",
  "category": "pizza|snacks|robux|...",
  "price": "number",
  "denomination": "number",
  "active": "boolean",
  "supplierStatus": "Disponible|Sin Stock|Descontinuado",
  "createdAt": "timestamp",
  "updatedAt": "timestamp"
}
```

### **Collection: happycode_requests**
```json
{
  "uid": "string",
  "userName": "string",
  "currentCode": "string",
  "newCode": "string",
  "status": "pending|approved|rejected",
  "createdAt": "timestamp"
}
```

### **Collection: reviews**
```json
{
  "uid": "string",
  "userName": "string",
  "displayName": "string",
  "rating": "number",
  "title": "string",
  "content": "string",
  "orderIds": ["string"],
  "verified": "boolean",
  "status": "pending|approved|rejected",
  "createdAt": "timestamp"
}
```

---

## 🚀 API ENDPOINTS

All API calls go through `api/account.js` with `?action=` parameter:

```
POST /api/account?action=logLogin
POST /api/account?action=verifyOnboardingCode
POST /api/account?action=sendPasswordReset
POST /api/account?action=sendDeletePin
POST /api/account?action=deleteAccount
POST /api/account?action=adminCreateClient
POST /api/account?action=adminSendPasswordReset
POST /api/account?action=updateContractText
POST /api/account?action=uploadMarketingImage
POST /api/account?action=sendMarketingEmail
GET  /api/account?action=getRecipients&filter=all|active|robuxUsers|highScore
GET  /api/account?action=getUsersList
POST /api/account?action=sendBulk
POST /api/account?action=sendWelcomeEmail
POST /api/account?action=sendOrderConfirmationEmail
POST /api/account?action=requestHappyCodeChange
GET  /api/account?action=listHappyCodeRequests
POST /api/account?action=approveHappyCodeChange
POST /api/account?action=rejectHappyCodeChange
```

---

## 🔐 SECURITY FEATURES

- ✅ Firebase Auth (secure token-based auth)
- ✅ Admin role verification on sensitive actions
- ✅ Firestore Security Rules (database-level access control)
- ✅ Email verification for sensitive operations
- ✅ Password reset via secure tokens
- ✅ One-time PINs for account deletion
- ✅ Rate limiting on API calls (10-20 per minute per IP)
- ✅ CORS configuration (only happycorner.top)
- ✅ Non-blocking email (failures don't crash requests)
- ✅ Private user data (reviews anonymous, debt hidden)

---

## 📈 SCALABILITY

**Current**: Vercel (12 serverless functions max)  
**Future**: Migrate to Cloudflare Workers (unlimited functions, 10x cheaper)

**Can handle**:
- ✅ 1000+ concurrent users
- ✅ 100k+ requests/month
- ✅ Real-time Firestore listeners
- ✅ Global CDN via Cloudflare

---

## 🎓 LEARNING RESOURCES

- **Firebase**: https://firebase.google.com/docs
- **Vercel**: https://vercel.com/docs
- **Cloudflare**: https://developers.cloudflare.com/
- **Resend Email**: https://resend.com/docs

---

## 👤 CONTACT & SUPPORT

**Owner**: Evan L.
**Email**: somos@happycorner.top  
**Website**: https://happycorner.top  
**GitHub**: https://github.com/realgangstaforlife/happy-corner  

---

## 📝 VERSION HISTORY

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | Aug 2026 | Initial launch with all core features |
| 0.9.0 | Jul 2026 | Robux system + email marketing |
| 0.8.0 | Jun 2026 | HappyCode + reviews system |
| 0.1.0 | May 2026 | Firebase migration complete |

---

