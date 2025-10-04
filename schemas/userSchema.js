
const Joi = require('joi');

const createUserSchema = Joi.object({
  name: Joi.string().min(2).required(),
  email: Joi.string().email().required(), 
  mobile: Joi.string().pattern(/^[0-9]{10}$/).optional(),
});

const creatmemberSchema = Joi.object({
   memberId: Joi.string().min(2).required(),
   electionId : Joi.number().required(),
})
const createOtpsend = Joi.object({
   selectedMethod: Joi.string().min(2).required(),
   memberId: Joi.string().required(),
   electionId: Joi.number().required(),
})



module.exports = { createUserSchema ,creatmemberSchema,createOtpsend};
