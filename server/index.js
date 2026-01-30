const express = require('express');
const http = require('http');
const socketio = require('socket.io');
const cors = require('cors');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');

const app = express();
const server = http.createServer(app);
const io = socketio(server, { cors: { origin: '*' } });

app.use(cors());
app.use(bodyParser.json());

// Rate limiting to prevent abuse
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: { error: 'Too many requests, please try again later' }
});

app.use('/messages', limiter); // Apply to message endpoints

const SECRET_KEY = process.env.SECRET_KEY || 'mysecret123';
const MAX_MESSAGES = 10000; // Prevent unbounded growth
let messagesMap = new Map(); // O(1) lookups
let messagesArray = []; // For ordered iteration
let idCounter = 1;

// Middleware JWT
function auth(req, res, next) {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token' });
    try {
        jwt.verify(token, SECRET_KEY);
        next();
    } catch (e) {
        res.status(403).json({ error: 'Invalid token' });
    }
}

// Auth route
app.post('/login', (req, res) => {
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: 'No username' });
    const token = jwt.sign({ username }, SECRET_KEY);
    res.json({ token });
});

// CRUD routes
app.get('/messages', auth, (req, res) => {
    const limitParam = req.query.limit;
    const offsetParam = req.query.offset;
    
    const limit = limitParam !== undefined ? parseInt(limitParam) : 100;
    const offset = offsetParam !== undefined ? parseInt(offsetParam) : 0;
    
    // Validate pagination params
    if (isNaN(limit) || limit < 1 || limit > 1000) {
        return res.status(400).json({ error: 'Limit must be between 1 and 1000' });
    }
    if (isNaN(offset) || offset < 0) {
        return res.status(400).json({ error: 'Offset must be non-negative' });
    }
    
    const paginatedMessages = messagesArray.slice(offset, offset + limit);
    res.json({
        messages: paginatedMessages,
        total: messagesArray.length,
        limit,
        offset
    });
});

app.post('/messages', auth, (req, res) => {
    const { text } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ error: 'No text' });
    if (typeof text !== 'string') return res.status(400).json({ error: 'Text must be a string' });
    if (text.length > 10000) return res.status(400).json({ error: 'Text too long (max 10000 chars)' });
    
    // Enforce max message limit and notify clients of removal
    if (messagesArray.length >= MAX_MESSAGES) {
        const oldest = messagesArray.shift();
        messagesMap.delete(oldest.id);
        io.emit('delete_message', oldest);
    }
    
    const msg = { id: idCounter++, text, timestamp: Date.now() };
    messagesArray.push(msg);
    messagesMap.set(msg.id, msg);
    io.emit('new_message', msg);
    res.json(msg);
});

app.put('/messages/:id', auth, (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
    
    const msg = messagesMap.get(id); // O(1) lookup
    if (!msg) return res.status(404).json({ error: 'Not found' });
    
    const { text } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ error: 'No text' });
    if (typeof text !== 'string') return res.status(400).json({ error: 'Text must be a string' });
    if (text.length > 10000) return res.status(400).json({ error: 'Text too long (max 10000 chars)' });
    
    msg.text = text;
    msg.updatedAt = Date.now();
    io.emit('update_message', msg);
    res.json(msg);
});

app.delete('/messages/:id', auth, (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
    
    const msg = messagesMap.get(id); // O(1) lookup
    if (!msg) return res.status(404).json({ error: 'Not found' });
    
    messagesMap.delete(id);
    const index = messagesArray.findIndex(m => m.id === id);
    if (index !== -1) {
        messagesArray.splice(index, 1);
    }
    io.emit('delete_message', msg);
    res.json(msg);
});

// Socket.IO
io.on('connection', socket => {
    console.log('Client connected');
    socket.on('disconnect', () => console.log('Client disconnected'));
});

server.listen(3000, () => console.log('Server running on port 3000'));
