// Apply before routes and static files so errors and HTML receive the same protection.
export function securityHeaders(req, res, next) {
  res.set({
    'Content-Security-Policy': [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "script-src 'self' https://maps.googleapis.com https://maps.gstatic.com https://www.gstatic.com https://www.google.com",
      "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com https://www.gstatic.com https://www.google.com",
      "font-src 'self' https://cdn.jsdelivr.net https://fonts.gstatic.com",
      "img-src 'self' data: blob: https:",
      "connect-src 'self' https://maps.googleapis.com https://maps.gstatic.com https://places.googleapis.com https://www.gstatic.com https://www.google.com",
      "frame-src https://www.google.com",
      "worker-src 'self' blob:",
    ].join('; '),
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  });
  if (process.env.NODE_ENV === 'production') {
    res.set('Strict-Transport-Security', 'max-age=31536000');
  }
  if (req.path.startsWith('/api/')) res.set('Cache-Control', 'no-store');
  next();
}

export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  if (err.name === 'MulterError') {
    return res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).send({ message: 'Invalid upload' });
  }
  if (err.name === 'ValidationError' || err.name === 'CastError' || err.type === 'entity.parse.failed') {
    return res.status(400).send({ message: 'Invalid request' });
  }
  if (err.type === 'entity.too.large') return res.status(413).send({ message: 'Request too large' });
  console.error(err);
  res.status(500).send({ message: 'Internal server error' });
}
