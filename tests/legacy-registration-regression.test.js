/** TDD safety gate: keeping an old router mounted by itself must not
 * accidentally restore public Admin account creation.
 */
const express=require('express');
const request=require('supertest');
const Admin=require('../backend/models/Admin');
const routes=require('../frontend/routes/frontendRoutes');
const app=express();
app.use(express.urlencoded({extended:true}));
app.use(express.json());
app.use(routes);

test('TDD: the legacy frontend registration handler must reject public Admin signups',async()=>{
  const query=jest.spyOn(Admin,'findOne').mockResolvedValue(null);
  const save=jest.spyOn(Admin.prototype,'save').mockResolvedValue({});
  try {
    const result=await request(app).post('/register').send({name:'Injected Admin',email:'newadmin@example.test',password:'ValidPass123',role:'Admin'});
    expect(result.status).toBe(403);
    expect(query).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  } finally {jest.restoreAllMocks();}
});
