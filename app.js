const express = require('express');
const dbMiddleware = require('./middleware/dbMiddleware');
const errorHandler = require('./middleware/errorHandler');
const cors = require('cors')
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');



const app = express();

// Middleware
app.use(express.json());
app.use(dbMiddleware);
app.use(cookieParser());
app.use(express.json());
app.use(
  cors({
      origin: "http://localhost:5173",
    credentials: true,
  })
);


// Routes
const voteRoutes = require('./routes/voteRoutes');
const authRoutes = require('./routes/authRoutes')
app.use('/api/vote', voteRoutes);
app.use('/api/auth',authRoutes)


//Handling ratelimt
app.use('/api/vote', rateLimit({ windowMs: 60*1000, max: 5 }));// max 5 votes per minute

// Error Handler (last middleware)
app.use(errorHandler);

module.exports = app;
