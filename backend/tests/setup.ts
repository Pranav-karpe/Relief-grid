import mongoose from 'mongoose'

process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret-that-is-longer-than-32-characters'
// Override MONGODB_URI so tests never connect to the real Atlas database.
// Any route test that tries a DB operation will time out via bufferTimeoutMS below.
process.env.MONGODB_URI = 'mongodb://127.0.0.1:27099/reliefgrid-test-nodb'

// Without a live DB connection, Mongoose buffers queries indefinitely by default.
// A short timeout makes route tests that hit the DB fail fast (within ~1.5 s)
// rather than hanging for the full default 10 s.
mongoose.set('bufferTimeoutMS', 1500)
