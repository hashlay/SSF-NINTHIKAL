const fs = require('fs');
const path = require('path');

const targetPath = path.join(process.cwd(), 'server', 'routes.ts');
let content = fs.readFileSync(targetPath, 'utf8');

// Replace synchronous route handlers with async
// e.g. apiRouter.get('/foo', (req, res) => {
// or   apiRouter.post('/bar', authenticate, (req, res) => {
// or   apiRouter.put('/baz', authorizeRole(...), (req, res) => {
content = content.replace(/(\w+\.(get|post|put|delete)\([^,]+(?:,\s*[a-zA-Z0-9_\(\)\.]+)*,\s*)\(req,\s*res\)\s*=>/g, '$1async (req, res) =>');

// Handle cases without middlewares: apiRouter.get('/foo', (req, res) => {
content = content.replace(/(apiRouter\.(get|post|put|delete)\([^,]+,\s*)\(req,\s*res\)\s*=>/g, '$1async (req, res) =>');

// Generic fallback for any (req, res) => that is not already async
content = content.replace(/(?<!async\s+)\(req,\s*res\)\s*=>/g, 'async (req, res) =>');
content = content.replace(/(?<!async\s+)\(req,\s*res,\s*next\)\s*=>/g, 'async (req, res, next) =>');

fs.writeFileSync(targetPath, content, 'utf8');
console.log("Made route handlers async");
