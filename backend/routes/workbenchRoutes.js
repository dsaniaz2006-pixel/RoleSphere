const router=require('express').Router();
const {requireRole}=require('../middleware/authMiddleware');
const models={Admin:require('../models/Admin'),HR:require('../models/HR'),Manager:require('../models/Manager'),Employee:require('../models/Employee')};
const Team=require('../models/Team'),Task=require('../models/Task'),Plan=require('../models/TaskPlan'),Attendance=require('../models/Attendance');
const {ymd}=require('../utils/dates');
router.use(requireRole('Admin','HR','Manager','Employee'));
router.use((req,res,next)=>{res.set('Cache-Control','no-store');next();});
const validId=x=>typeof x==='string'&&/^[a-f0-9]{24}$/i.test(x);
const text=(x,max)=>typeof x==='string'&&x.trim().length<=max;
const date=x=>typeof x==='string'&&x>='1900-01-01'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&!isNaN(Date.parse(x))&&new Date(x).toISOString().slice(0,10)===x;
const wrap=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
router.get('/profile',wrap(async(req,res)=>{
 const user=await models[req.currentUser.role].findById(req.currentUser.id).select('name email phone +dob +bio').lean();
 if(!user)return res.status(404).json({error:'Account not found'});
 res.json({profile:{name:user.name,email:user.email,phone:user.phone||'',dob:user.dob||'',bio:user.bio||'',role:req.currentUser.role}});
}));
router.patch('/profile',wrap(async(req,res)=>{
 const {name,phone,dob,bio}=req.body;
 if(!text(name,100)||!name.trim()||!text(phone,30)||(phone&&!/^[+\d\s().-]+$/.test(phone))||!text(bio,1000)||typeof dob!=='string'||(dob&&(!date(dob)||dob>ymd())))return res.status(400).json({error:'Enter a name, valid phone and past date of birth. Bio may contain up to 1,000 characters.'});
 const user=await models[req.currentUser.role].findByIdAndUpdate(req.currentUser.id,{$set:{name:name.trim(),phone:phone.trim(),dob,bio:bio.trim()}},{new:true,runValidators:true}).select('name');
 if(!user)return res.status(404).json({error:'Account not found'});
 (req.session.admin||req.session.user).name=user.name;
 res.json({success:true});
}));
async function scope(actor){
 if(['Admin','HR'].includes(actor.role))return {};
 if(actor.role==='Employee')return {employeeId:actor.id,assignedToModel:'Employee'};
 return {$or:[{managerId:actor.id,assignedToModel:'Manager'},{employeeId:{$in:await models.Employee.find({managerId:actor.id}).distinct('_id')},assignedToModel:'Employee'}]};
}
router.get('/tasks',wrap(async(req,res)=>{
 const filter=await scope(req.currentUser);
 const page=Math.max(1,Math.min(100000,parseInt(req.query.page,10)||1));
 const [tasks,total]=await Promise.all([Task.find(filter).select('title description deadline status submittedAt employeeId managerId assignedToModel').sort({deadline:1,_id:1}).skip((page-1)*40).limit(40).lean(),Task.countDocuments(filter)]);
 const plans=await Plan.find({taskId:{$in:tasks.map(t=>t._id)}}).lean();
 res.json({tasks:tasks.map(task=>({...task,plan:plans.find(p=>String(p.taskId)===String(task._id))||null})),page,pages:Math.ceil(total/40),total});
}));
router.put('/tasks/:id/plan',wrap(async(req,res)=>{
 if(!validId(req.params.id))return res.status(400).json({error:'Invalid task'});
 const task=await Task.findOne({$and:[{_id:req.params.id},await scope(req.currentUser)]});
 if(!task)return res.status(404).json({error:'Task not found'});
 const {startDate,submissionDate,progress,notes,goals}=req.body;
 if(typeof startDate!=='string'||typeof submissionDate!=='string'||(startDate&&!date(startDate))||(submissionDate&&!date(submissionDate))||(startDate&&submissionDate&&submissionDate<startDate)||!Number.isInteger(progress)||progress<0||progress>100||!text(notes,2000)||!Array.isArray(goals)||goals.length>12||goals.some(g=>!g||!text(g.text,160)||!g.text.trim()||typeof g.done!=='boolean'))return res.status(400).json({error:'Use valid dates (submission after start), 0–100 progress and up to 12 milestones.'});
 const plan=await Plan.findOneAndUpdate({taskId:task._id},{$set:{startDate,submissionDate,progress,notes:notes.trim(),goals:goals.map(g=>({text:g.text.trim(),done:g.done}))}},{new:true,upsert:true,runValidators:true});
 res.json({plan});
}));
router.get('/attendance',wrap(async(req,res)=>{
 const month=req.query.month||ymd().slice(0,7);
 if(typeof month!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))return res.status(400).json({error:'Invalid month'});
 if(req.currentUser.role==='Admin')return res.json({records:[],notice:'Administrators do not clock attendance. Use the dashboard attendance report for organization records.'});
 const records=await Attendance.find({userId:req.currentUser.id,userModel:req.currentUser.role,date:{$gte:month+'-01',$lte:month+'-31'}}).select('date status checkInTime checkOutTime checkIn checkOut isLate').sort({date:1}).lean();
 res.json({records});
}));
router.get('/team-options',requireRole('HR','Manager'),wrap(async(req,res)=>{
 const managers=await models.Manager.find({isApproved:true,status:'approved',...(req.currentUser.role==='Manager'?{_id:req.currentUser.id}:{})}).select('name').sort({name:1}).lean();
 const managerIds=managers.map(m=>m._id);
 const employees=await models.Employee.find({isApproved:true,status:'approved',managerId:{$in:managerIds}}).select('name department managerId').sort({name:1}).lean();
 res.json({managers,employees});
}));
router.get('/teams',wrap(async(req,res)=>{
 const actor=req.currentUser;
 const filter=actor.role==='Manager'?{managerId:actor.id}:actor.role==='Employee'?{memberIds:actor.id}:{};
 const teams=await Team.find(filter).sort({createdAt:-1}).limit(100).lean();
 // Only current reporting relationships appear; an old team cannot retain transferred staff's data.
 for(const team of teams){
  team.members=await models.Employee.find({_id:{$in:team.memberIds},managerId:team.managerId,isApproved:true,status:'approved'}).select('name department').lean();
  const manager=await models.Manager.findById(team.managerId).select('name').lean();team.managerName=manager?.name||'Unassigned';
  delete team.memberIds;delete team.createdBy;
 }
 res.json({teams:teams.filter(t=>actor.role!=='Employee'||t.members.some(e=>String(e._id)===String(actor.id)))});
}));
router.post('/teams',requireRole('HR','Manager'),wrap(async(req,res)=>{
 const actor=req.currentUser;const {name,description,managerId,memberIds}=req.body;
 if(!text(name,80)||!name.trim()||!text(description,500)||!validId(managerId)||!Array.isArray(memberIds)||!memberIds.length||memberIds.length>100||memberIds.some(id=>!validId(id))||new Set(memberIds).size!==memberIds.length)return res.status(400).json({error:'Choose a team name, manager and 1–100 unique members.'});
 if(actor.role==='Manager'&&managerId!==String(actor.id))return res.status(403).json({error:'Managers can only create teams within their own reporting group.'});
 const manager=await models.Manager.findOne({_id:managerId,isApproved:true,status:'approved'});
 if(!manager||await models.Employee.countDocuments({_id:{$in:memberIds},managerId,isApproved:true,status:'approved'})!==memberIds.length)return res.status(400).json({error:'Every member must be approved and report to the selected manager. Use the transfer workflow to change reporting lines.'});
 const team=await Team.create({name:name.trim(),description:description.trim(),managerId,memberIds,createdBy:actor.id,createdByRole:actor.role});
 res.status(201).json({id:team.id});
}));
module.exports=router;
