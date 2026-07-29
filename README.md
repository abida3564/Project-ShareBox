# ShareBox

### Smart Campus Resource Sharing Platform

🔗 **Live Website:**  
** https://keyacse.github.io/ShareBox/**

---

## About

ShareBox is a smart campus resource-sharing platform developed for UITS students. It enables students to borrow, rent, sell, donate, and share useful items within the university community. The platform also provides a Need Board, messaging system, profile management, and an admin dashboard to create a secure and organized resource-sharing experience.

---

## Features

- Student Registration with Student ID Verification
- Secure Login & Authentication
- Browse Campus Resources
- Borrow, Rent, Sell & Donate Items
- My Resources Management
- Need Board
- User Messaging
- Profile & Account Management
- Profile & Cover Photo Upload
- Settings Management
- Admin Dashboard
- User & Product Management
- PostgreSQL Database Integration
- Responsive Design

---

## Technologies Used

| Category | Technologies |
|----------|--------------|
| Programming Languages | HTML5, CSS3, JavaScript, SQL |
| Backend | Node.js, Express.js |
| Database | PostgreSQL |
| Authentication | JWT, bcrypt.js |
| File Upload | Multer |
| Frontend Hosting | GitHub Pages |
| Backend Hosting | Render |
| Development Tools | Visual Studio Code, Git, GitHub |

---

## System Workflow

```
User
   │
   ▼
Frontend (GitHub Pages)
   │
REST API
   │
   ▼
Node.js + Express.js
   │
   ▼
PostgreSQL Database
```

---

## User Roles

### Student

- Register and Login
- Browse Resources
- Upload Resource Posts
- Edit & Delete Own Posts
- Post on Need Board
- Send Messages
- Update Profile
- Upload Profile & Cover Photos
- Manage Account Settings

### Admin

- Secure Admin Login
- View Registered Users
- View Resource Posts
- Search Users & Products
- Verify Users
- Delete Users & Posts
- Monitor Dashboard Statistics

---

## Database Tables

| Table | Description |
|-------|-------------|
| users | User Information |
| products | Resource Posts |
| needs | Need Board Posts |
| messages | User Messages |
| notifications | Notifications |
| admins | Admin Information |

---

## Project Structure

```
ShareBox/
│
├── index.html
├── sharebox-login.html
├── sharebox-register.html
├── sharebox-dashboard.html
├── sharebox-resources.html
├── sharebox-upload.html
├── sharebox-needs.html
├── sharebox-messages.html
├── sharebox-settings.html
├── sharebox-account.html
├── sharebox-admin.html
│
├── app-core.js
├── api-config.js
├── server.js
├── schema.sql
├── package.json
├── render.yaml
└── README.md
```

---

## Installation

### Clone Repository

```bash
git clone YOUR_GITHUB_REPOSITORY_LINK
```

### Open Project

```bash
cd ShareBox
```

### Install Dependencies

```bash
npm install
```

### Create `.env`

```env
DATABASE_URL=YOUR_DATABASE_URL
JWT_SECRET=YOUR_SECRET_KEY
ADMIN_EMAIL=YOUR_ADMIN_EMAIL
ADMIN_PASSWORD=YOUR_ADMIN_PASSWORD
PORT=5000
```

### Run Backend

```bash
npm start
```

---

## Deployment

| Component | Platform |
|-----------|----------|
| Frontend | GitHub Pages |
| Backend | Render |
| Database | Render PostgreSQL |

---

## Team Members

| Name | Student ID |
|------|------------|
| Arpa Bhowmik | U220 |
| Yeasmin Kabir Keya | U205 |
| Fahima Abida Chowdhury | U210 |

---

## Future Improvements

- Product Ratings & Reviews
- Online Payment Integration
- Recommendation System
- QR-based Student Verification
- Mobile Application

---

## License

This project is developed for academic and educational purposes.

---

## Acknowledgement

We sincerely thank our respected faculty mentors for their continuous guidance, valuable feedback, and support throughout the development of this project.
