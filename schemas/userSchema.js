
const Joi = require('joi');

const createUserSchema = Joi.object({
  name: Joi.string().min(2).required(),
  email: Joi.string().email().required(), 
  mobile: Joi.string().pattern(/^[0-9]{10}$/).optional(),
});

const creatmemberSchema = Joi.object({
   memberId: Joi.string().min(2).required(),
   electionId : Joi.number().required(),
   post_id : Joi.number().required(),
})
const createOtpsend = Joi.object({
   selectedMethod: Joi.string().valid("phone","email").required().messages({
       "any.only": "selectedMethod must be either 'phone' or 'email'",
      "any.required": "selectedMethod is required",
      "string.base": "selectedMethod must be a string"
   })
 
});
const createverifyOtp = Joi.object({
  OTP: Joi.string().required()

})

const creatVotechoose = Joi.object({
   candidate_id:Joi.number().required()
})



module.exports = { createUserSchema ,creatmemberSchema,createOtpsend,creatVotechoose,createverifyOtp};
