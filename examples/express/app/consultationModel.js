var mongoose = require('mongoose'),
  bcrypt = require('bcryptjs');

var consultationSchema = mongoose.Schema({
  email: String
});


module.exports = mongoose.model('real_consultations', consultationSchema);
