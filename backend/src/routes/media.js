const express = require('express');
const router = express.Router();

// GET /api/media/movies
router.get('/movies', (req, res) => {
  res.json({ message: 'Movies list endpoint - to be implemented' });
});

// GET /api/media/tv-shows
router.get('/tv-shows', (req, res) => {
  res.json({ message: 'TV shows list endpoint - to be implemented' });
});

// GET /api/media/search
router.get('/search', (req, res) => {
  res.json({ message: 'Media search endpoint - to be implemented' });
});

// POST /api/media/upload
router.post('/upload', (req, res) => {
  res.json({ message: 'Media upload endpoint - to be implemented' });
});

// GET /api/media/:id
router.get('/:id', (req, res) => {
  res.json({ message: 'Media details endpoint - to be implemented' });
});

// PUT /api/media/:id
router.put('/:id', (req, res) => {
  res.json({ message: 'Media update endpoint - to be implemented' });
});

// DELETE /api/media/:id
router.delete('/:id', (req, res) => {
  res.json({ message: 'Media delete endpoint - to be implemented' });
});

// POST /api/media/scan
router.post('/scan', (req, res) => {
  res.json({ message: 'Media scan endpoint - to be implemented' });
});

module.exports = router; 
