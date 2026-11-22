const mongoose = require('mongoose');
const schema = new mongoose.Schema({
 taskId:{type:mongoose.Schema.Types.ObjectId,ref:'Task',required:true,unique:true},
 startDate:{type:String,default:''},submissionDate:{type:String,default:''},
 progress:{type:Number,min:0,max:100,default:0},notes:{type:String,default:'',maxlength:2000},
 goals:[{text:{type:String,maxlength:160},done:Boolean}]
},{timestamps:true});
module.exports=mongoose.model('TaskPlan',schema);
