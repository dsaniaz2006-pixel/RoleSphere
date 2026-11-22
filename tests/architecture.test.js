'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { assertServerEnvironment } = require('../backend/config/environment');
const { sameOriginWrites } = require('../backend/middleware/sameOriginWrites');
const { handleError, handleNotFound, asyncHandler, describeError } = require('../backend/middleware/errorHandling');
const AppError = require('../backend/errors/AppError');
const root = path.resolve(__dirname, '..');
const exists = p => fs.existsSync(path.join(root,p));
function env(overrides={}) { return { MONGO_URI:'mongodb://localhost:27017/rolesphere_test', SESSION_SECRET:'a'.repeat(48), JWT_SECRET:'b'.repeat(48), PORT:'8001', HTTPS_ENABLED:'true', COOKIE_SECURE:'true', NODE_ENV:'development', ...overrides }; }
function response() { const res={statusCode:200,headersSent:false,body:undefined};res.status=code=>{res.statusCode=code;return res;};res.json=body=>{res.body=body;return res;};res.send=body=>{res.body=body;return res;};return res; }

test('React source, backend HTTP, realtime and documentation live in their owning folders',()=>{
  for (const file of ['backend/http/registerRoutes.js','backend/realtime/socketServer.js','backend/errors/AppError.js','backend/validators/writeValidation.js','frontend/src/components/ui/filtered-table.tsx','frontend/src/lib/utils.ts','frontend/src/services/apiClient.ts','frontend/src/state/api.ts','docs/architecture/CODEBASE.md','config/env/local-https.env.example'])expect(exists(file)).toBe(true);
  for (const file of ['socketSetup.js','components/ui/demo.tsx','backend/config/db.js','backend/routes/overview.js','backend/controllers/employeeController.js','backend/controllers/taskController.js'])expect(exists(file)).toBe(false);
});
test('development accepts the current config and production requires strong secrets and secure cookies',()=>{
  expect(assertServerEnvironment(env()).port).toBe(8001);
  expect(()=>assertServerEnvironment(env({NODE_ENV:'production'}))).not.toThrow();
  expect(()=>assertServerEnvironment(env({NODE_ENV:'production',SESSION_SECRET:'supersecretkey123'}))).toThrow('SESSION_SECRET');
  expect(()=>assertServerEnvironment(env({NODE_ENV:'production',COOKIE_SECURE:'false',HTTPS_ENABLED:'false'}))).toThrow('secure cookies');
  expect(()=>assertServerEnvironment(env({PORT:'not-a-port'}))).toThrow('PORT');
  expect(()=>assertServerEnvironment(env({MONGO_URI:'https://example.invalid'}))).toThrow('MONGO_URI');
  const { isPlaceholder } = require('../backend/config/environment');
  expect(isPlaceholder('replace-with-a-real-secret')).toBe(true);
  expect(isPlaceholder('change-this-secret')).toBe(true);
});
test('same-origin write policy blocks a foreign browser POST but permits same origin',()=>{
  const req={method:'POST',get:k=>({'Origin':'https://evil.example','host':'localhost:8001'})[k],protocol:'https'};
  const r=response();const next=jest.fn();sameOriginWrites(req,r,next);expect(r.statusCode).toBe(403);expect(next).not.toHaveBeenCalled();
  req.get=k=>({'Origin':'https://localhost:8001','host':'localhost:8001'})[k];sameOriginWrites(req,response(),next);expect(next).toHaveBeenCalledTimes(1);
});
test('central error handler covers malformed data, file-size limits and unknown failures without stack exposure',()=>{
  const req={},next=jest.fn();
  for (const [error,code] of [[{name:'CastError',message:'private details'},400],[{code:'LIMIT_FILE_SIZE',message:'private details'},413],[{name:'Error',message:'private details'},500]]){
    const r=response();jest.spyOn(console,'error').mockImplementation(()=>{});handleError(error,req,r,next);jest.restoreAllMocks();expect(r.statusCode).toBe(code);expect(r.body.error).not.toContain('private details');expect(r.body.message).toBe(r.body.error);
  }
});
test('AppError maps expected failures to safe, stable HTTP descriptors',()=>{
  expect(describeError(new AppError('Employee not found',{statusCode:404,code:'EMPLOYEE_NOT_FOUND'}))).toEqual({status:404,code:'EMPLOYEE_NOT_FOUND',message:'Employee not found'});
  expect(describeError(new AppError('database connection contains private data',{statusCode:500,code:'DATABASE_FAILURE'}))).toEqual({status:500,code:'DATABASE_FAILURE',message:'Something went wrong'});
  expect(describeError({code:11000})).toMatchObject({status:409,code:'DUPLICATE_RESOURCE'});
  expect(describeError({type:'entity.parse.failed'})).toMatchObject({status:400,code:'INVALID_JSON'});
  expect(describeError({code:'LIMIT_FILE_SIZE'})).toMatchObject({status:413,code:'UPLOAD_TOO_LARGE'});
});
test('async handler forwards rejected promises to the central Express error handler',async()=>{
  const next=jest.fn();const failure=new Error('failed');await asyncHandler(async()=>{throw failure;} )({},response(),next);expect(next).toHaveBeenCalledWith(failure);
});
test('all local documentation links resolve after moving Markdown files',()=>{
  const files=[];const visit=d=>{for(const f of fs.readdirSync(d,{withFileTypes:true})){const full=path.join(d,f.name);if(f.isDirectory())visit(full);else if(full.endsWith('.md'))files.push(full);}};visit(path.join(root,'docs'));files.push(path.join(root,'README.md'));
  for(const file of files){const md=fs.readFileSync(file,'utf8');for(const match of md.matchAll(/(?<!!)\[[^\]]+\]\(([^)]+)\)/g)){const url=match[1].split('#')[0];if(!url||/^(https?:|mailto:|#|plugin:|\/)/.test(url))continue;expect(fs.existsSync(path.resolve(path.dirname(file),url))).toBe(true);}}
});
