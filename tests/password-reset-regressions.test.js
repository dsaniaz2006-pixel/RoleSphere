/** TDD regression tests for single-use password-reset tokens.
 * A concurrent reset must never be able to use the same token twice.
 */
const crypto=require('node:crypto');
const ResetToken=require('../backend/models/PasswordResetToken');
const Employee=require('../backend/models/Employee');
const audit=require('../backend/services/auditService');
const controller=require('../backend/controllers/passwordResetController');
let tokenDelete, userUpdate, auditSpy;
const raw='0123456789abcdef'.repeat(4);
const makeResponse=()=>({render:jest.fn(),status:jest.fn().mockReturnThis()});
const req=()=>({params:{token:raw},body:{password:'NewStrongPassword!123',confirmPassword:'NewStrongPassword!123'}});

beforeEach(()=>{
  tokenDelete=jest.spyOn(ResetToken,'findOneAndDelete');
  jest.spyOn(ResetToken,'deleteMany').mockResolvedValue({deletedCount:1});
  userUpdate=jest.spyOn(Employee,'findOneAndUpdate').mockResolvedValue({_id:'updated-user'});
  auditSpy=jest.spyOn(audit,'audit').mockResolvedValue();
});
afterEach(()=>jest.restoreAllMocks());

test('TDD: password reset claims the single-use token atomically before changing the password',async()=>{
  tokenDelete.mockResolvedValue({email:'browser@example.test',role:'Employee'});
  const find=jest.spyOn(ResetToken,'findOne').mockResolvedValue({email:'browser@example.test',role:'Employee'});
  const res=makeResponse();
  await controller.postResetPassword(req(),res);
  const selector=tokenDelete.mock.calls[0]?.[0];
  expect(selector.token).toBe(crypto.createHash('sha256').update(raw).digest('hex'));
  expect(selector.expiresAt.$gt).toBeInstanceOf(Date);
  expect(find).not.toHaveBeenCalled();
  expect(userUpdate).toHaveBeenCalledTimes(1);
  expect(res.render).toHaveBeenCalledWith('reset-password-success',expect.any(Object));
});

test('TDD: a replayed password-reset token cannot change the password a second time',async()=>{
  tokenDelete.mockResolvedValueOnce({email:'browser@example.test',role:'Employee'}).mockResolvedValueOnce(null);
  jest.spyOn(ResetToken,'findOne').mockResolvedValue({email:'browser@example.test',role:'Employee'});
  const first=makeResponse(),second=makeResponse();
  await controller.postResetPassword(req(),first);
  await controller.postResetPassword(req(),second);
  expect(userUpdate).toHaveBeenCalledTimes(1);
  expect(second.render).toHaveBeenCalledWith('reset-password',expect.objectContaining({token:null,error:expect.stringMatching(/invalid|expired/i)}));
});
