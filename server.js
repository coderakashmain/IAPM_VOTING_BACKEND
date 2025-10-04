const app = require('./app.js')
const dotenv = require("dotenv");


dotenv.config({ quiet: true });


const PORT = process.env.PORT || 3000;




app.listen(PORT,()=>{
    console.log(`Server is running on port ${PORT}`)
})