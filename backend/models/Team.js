const mongoose = require('mongoose');
const schema = new mongoose.Schema({
 name:{type:String,required:true,maxlength:80}, description:{type:String,default:'',maxlength:500},
 managerId:{type:mongoose.Schema.Types.ObjectId,ref:'Manager',required:true},
 memberIds:[{type:mongoose.Schema.Types.ObjectId,ref:'Employee'}],
 createdBy:{type:mongoose.Schema.Types.ObjectId,required:true},createdByRole:{type:String,enum:['HR','Manager'],required:true}
},{timestamps:true});
schema.index({managerId:1});schema.index({memberIds:1});
module.exports=mongoose.model('Team',schema);
