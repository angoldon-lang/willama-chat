const express = require('express');
const { SystemCapabilities } = require('@librechat/data-schemas');
const { requireCapability } = require('~/server/middleware/roles/capabilities');
const { handlers } = require('~/server/services/willama');
const { requireJwtAuth } = require('~/server/middleware');

/** User-facing: each user sees only their own consumption. */
const user = express.Router();
user.use(requireJwtAuth);
user.get('/usage', handlers.myUsage);

/** Admin-facing: all users' consumption plus the anonymous AI-traffic summary. */
const admin = express.Router();
admin.use(requireJwtAuth, requireCapability(SystemCapabilities.ACCESS_ADMIN));
admin.get('/usage', handlers.allUsage);
admin.get('/traffic', handlers.traffic);

module.exports = { user, admin };
