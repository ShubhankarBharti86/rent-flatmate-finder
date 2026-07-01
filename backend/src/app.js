require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./routes/auth.routes');
const tenantProfileRoutes = require('./routes/tenantProfile.routes');
const listingRoutes = require('./routes/listing.routes');
const interestRoutes = require('./routes/interest.routes');
const chatRoutes = require('./routes/chat.routes');
const adminRoutes = require('./routes/admin.routes');
const errorHandler = require('./middleware/errorHandler');

const app = express();

app.use(cors({ origin: process.env.CLIENT_ORIGIN || '*' }));
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

app.use('/api/auth', authRoutes);
app.use('/api/tenant-profile', tenantProfileRoutes);
app.use('/api/listings', listingRoutes);
app.use('/api/interests', interestRoutes);
app.use('/api/chats', chatRoutes);
app.use('/api/admin', adminRoutes);

// Serve the static frontend (so the whole app can be deployed as a single service)
const frontendPath = path.join(__dirname, '..', '..', 'frontend');
app.use(express.static(frontendPath));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(frontendPath, 'index.html'));
});

app.use(errorHandler);

module.exports = app;
