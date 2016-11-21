'use strict';

var randtoken = require('rand-token'),
  nodemailer = require('nodemailer');

module.exports = function(mongoose) {

  var isPositiveInteger = function(x) {
    return ((parseInt(x, 10) === x) && (x >= 0));
  };

  var createOptionError = function(optionName, optionValue, expectedType) {
    return new TypeError('Expected ' + optionName + ' to be a ' + expectedType + ', got ' +
      typeof optionValue);
  };

  /**
   * Retrieve a nested value of an object given a string, using dot notation.
   *
   * @func getNestedValue
   * @param {object} obj - object to retrieve the value from
   * @param {string} path - path to value
   * @param {string} def - default value to return if not found
   */
  var getNestedValue = function(obj, path, def) {
    path = path.split('.');
    for (let i = 0, len = path.length; i < len; i++) {
      if (!obj || typeof obj !== 'object') {
        return def;
      }
      obj = obj[path[i]];
    }

    if (obj === undefined) {
      return def;
    }
    return obj;
  };


  // default options
  var options = {
    verificationURL: 'http://example.com/consultation-verification/${URL}',//the URL for the user to click to confirm their consultation. ${URL} determines where the randomly generated part of the URL goes, and is needed.
    URLLength: 48,//the length of the randomly-generated string. 

    // mongo-stuff
    persistentConsultationModel: null,//moongose model for the persistent consultation collection
    tempConsultationModel: null,//: the Mongoose Model for the temporary consultation collection.
    tempConsultationCollection: 'temporary_consultations',//the name of the MongoDB collection for temporary consultations.
    emailFieldName: 'email',//email of the user that wants to deploy a consultation
    //passwordFieldName: 'password',
    URLFieldName: 'GENERATED_VERIFYING_URL',//the field name for the randomly-generated UR
    expirationTime: 86400,//the amount of time that the temporary consultation will be kept in collection, measured in seconds. 

    // emailing options
    transportOptions: {
      service: 'Gmail',
      auth: {
        user: 'user@gmail.com',
        pass: 'password'
      }
    },
    verifyMailOptions: {
      from: 'Do Not Reply <user@gmail.com>',
      subject: 'Confirm your account',
      html: '<p>Please confirm your consultation by clicking <a href="${URL}">this link</a>. If you are unable to do so, copy and ' +
        'paste the following link into your browser:</p><p>${URL}</p>',
      text: 'Please confirm your consultation by clicking the following link, or by copying and pasting it into your browser: ${URL}'
    },
    verifySendMailCallback: function(err, info) {
      if (err) {
        throw err;
      } else {
        console.log(info.response);
      }
    },
    shouldSendConfirmation: true,
    confirmMailOptions: {
      from: 'Do Not Reply <user@gmail.com>',
      subject: 'Successfully verified!',
      html: '<p>Your account has been successfully verified.</p>',
      text: 'Your account has been successfully verified.'
    },
    confirmSendMailCallback: function(err, info) {
      if (err) {
        throw err;
      } else {
        console.log(info.response);
      }
    },
    hashingFunction: null,
  };


  var transporter;

  /**
   * Modify the default configuration.
   *
   * @func configure
   * @param {object} o - options to be changed
   */
  var configure = function(optionsToConfigure, callback) {
    for (let key in optionsToConfigure) {
      if (optionsToConfigure.hasOwnProperty(key)) {
        options[key] = optionsToConfigure[key];
      }
    }
    transporter = nodemailer.createTransport(options.transportOptions);

    var err;

    if (typeof options.verificationURL !== 'string') {
      err = err || createOptionError('verificationURL', options.verificationURL, 'string');
    } else if (options.verificationURL.indexOf('${URL}') === -1) {
      err = err || new Error('Verification URL does not contain ${URL}');
    }

    if (typeof options.URLLength !== 'number') {
      err = err || createOptionError('URLLength', options.URLLength, 'number');
    } else if (!isPositiveInteger(options.URLLength)) {
      err = err || new Error('URLLength must be a positive integer');
    }

    if (typeof options.tempConsultationCollection !== 'string') {
      err = err || createOptionError('tempConsultationCollection', options.tempConsultationCollection, 'string');
    }

    if (typeof options.emailFieldName !== 'string') {
      err = err || createOptionError('emailFieldName', options.emailFieldName, 'string');
    }
/*
    if (typeof options.passwordFieldName !== 'string') {
      err = err || createOptionError('passwordFieldName', options.passwordFieldName, 'string');
    }
*/
    if (typeof options.URLFieldName !== 'string') {
      err = err || createOptionError('URLFieldName', options.URLFieldName, 'string');
    }

    if (typeof options.expirationTime !== 'number') {
      err = err || createOptionError('expirationTime', options.expirationTime, 'number');
    } else if (!isPositiveInteger(options.expirationTime)) {
      err = err || new Error('expirationTime must be a positive integer');
    }

    if (err) {
      return callback(err, null);
    }

    return callback(null, options);
  };


  /**
   * Create a Mongoose Model for the temporary consultation, based off of the persistent
   * Consultation model, i.e. the temporary consultation inherits the persistent consultation. An
   * additional field for the URL is created, as well as a TTL.
   *
   * @func generateTempConsultationModel
   * @param {object} Consultation - the persistent Consultation model.
   * @return {object} the temporary consultation model
   */
  var generateTempConsultationModel = function(Consultation, callback) {
    if (!Consultation) {
      return callback(new TypeError('Persistent consultation model undefined.'), null);
    }
    var tempConsultationSchemaObject = {}, // a copy of the schema
      tempConsultationSchema;

    // copy over the attributes of the schema
    Object.keys(Consultation.schema.paths).forEach(function(field) {
      tempConsultationSchemaObject[field] = Consultation.schema.paths[field].options;
    });
    tempConsultationSchemaObject[options.URLFieldName] = String;

    // create a TTL
    tempConsultationSchemaObject.createdAt = {
      type: Date,
      expires: options.expirationTime.toString() + 's',
      default: Date.now
    };

    tempConsultationSchema = mongoose.Schema(tempConsultationSchemaObject);

    // copy over the methods of the schema
    Object.keys(Consultation.schema.methods).forEach(function(meth) { // tread lightly
      tempConsultationSchema.methods[meth] = Consultation.schema.methods[meth];
    });

    options.tempConsultationModel = mongoose.model(options.tempConsultationCollection, tempConsultationSchema);

    return callback(null, mongoose.model(options.tempConsultationCollection));
  };


  /**
   * Helper function for actually inserting the temporary consultation into the database.
   *
   * @func insertTempConsultation
   * @param {string} password - the user's password, possibly hashed (delete ?)
   * @param {object} tempConsultationData - the temporary consultation's data
   * @param {function} callback - a callback function, which takes an error and the
   *   temporary consultation object as params
   * @return {function} returns the callback function
   */
  var insertTempConsultation = function(tempConsultationData, callback) {
    // password may or may not be hashed
    //tempConsultationData[options.passwordFieldName] = password;
    var newTempConsultation = new options.tempConsultationModel(tempConsultationData);

    newTempConsultation.save(function(err, tempConsultation) {
      if (err) {
        return callback(err, null, null);
      }
      return callback(null, null, tempConsultation);
    });
  };


  /**
   * Attempt to create an instance of a temporary consultation based off of an instance of a
   * persistent consultation. If consultation already exists in the temporary collection, passes null
   * to the callback function; otherwise, passes the instance to the callback, with a
   * randomly generated URL associated to it.
   *
   * @func createTempConsultation
   * @param {object} consultation - an instance of the persistent Consultation model
   * @param {function} callback - a callback function that takes an error (if one exists),
   *   a persistent consultation (if it exists) and the new temporary consultation as arguments; if the
   *   temporary consultation already exists, then null is returned in its place
   * @return {function} returns the callback function
   */
  var createTempConsultation = function(consultation, callback) {
    if (!options.tempConsultationModel) {
      return callback(new TypeError('Temporary consultation model not defined. Either you forgot' +
        'to generate one or you did not predefine one.'), null);
    }

    // create our mongoose query
    var query = {};

    if(options.emailFieldName.split('.').length > 1){
      var levels = options.emailFieldName.split('.');
      query[levels[0]] = {};

      var queryObj = query[levels[0]];
      var consultationObj = consultation[levels[0]];
      for(var i=0; i<levels.length; i++){
        queryObj[levels[i+1]] = {};
        queryObj = queryObj[levels[i+1]];
        consultationObj = consultationObj[levels[i+1]];
      }

      queryObj = consultationObj;
    }else {
      query[options.emailFieldName] = consultation[options.emailFieldName];
    }

    options.persistentConsultationModel.findOne(query, function(err, existingPersistentConsultation) {
      if (err) {
        return callback(err, null, null);
      }


      options.tempConsultationModel.findOne(query, function(err, existingTempConsultation) {
        if (err) {
          return callback(err, null, null);
        }

        // consultation has already been submitted but not yet confirmed 
        if (existingTempConsultation) {
          return callback(null, null, null);
        } else {
          var tempConsultationData = {};

          // copy the credentials for the consultation
          Object.keys(consultation._doc).forEach(function(field) {
            tempConsultationData[field] = consultation[field];
          });

          tempConsultationData[options.URLFieldName] = randtoken.generate(options.URLLength);

          /*if (options.hashingFunction) {
            return options.hashingFunction(tempConsultationData[options.passwordFieldName], tempConsultationData,
              insertTempConsultation, callback);
          } else {*/
          return insertTempConsultation(tempConsultationData, callback);
         // }
        }
      });
    });
  };


  /**
   * Send a message to the email associated with the consultation requesting confirmation.
   *
   * @func sendVerificationEmail
   * @param {string} email - the user's email address.
   * @param {string} url - the unique url generated for the user.
   * @param {function} callback - the callback to pass to Nodemailer's transporter
   */
  var sendVerificationEmail = function(email, url, callback) {
    var r = /\$\{URL\}/g;

    // inject newly-created URL into the email's body and FIRE
    // stringify --> parse is used to deep copy
    var URL = options.verificationURL.replace(r, url),
      mailOptions = JSON.parse(JSON.stringify(options.verifyMailOptions));

    mailOptions.to = email;
    mailOptions.html = mailOptions.html.replace(r, URL);
    mailOptions.text = mailOptions.text.replace(r, URL);

    if (!callback) {
      callback = options.verifySendMailCallback;
    }
    transporter.sendMail(mailOptions, callback);
  };

  /**
   * Send an email to the user requesting confirmation.
   *
   * @func sendConfirmationEmail
   * @param {string} email - the user's email address.
   * @param {function} callback - the callback to pass to Nodemailer's transporter
   */
  var sendConfirmationEmail = function(email, callback) {
    var mailOptions = JSON.parse(JSON.stringify(options.confirmMailOptions));
    mailOptions.to = email;
    if (!callback) {
      callback = options.confirmSendMailCallback;
    }
    transporter.sendMail(mailOptions, callback);
  };

  /**
   * Transfer a temporary consultation from the temporary collection to the persistent
   * consultation collection, removing the URL assigned to it.
   *
   * @func confirmTempConsultation
   * @param {string} url - the randomly generated URL assigned to a unique email
   */
  var confirmTempConsultation = function(url, callback) {
    var TempConsultation = options.tempConsultationModel,
      query = {};
    query[options.URLFieldName] = url;

    TempConsultation.findOne(query, function(err, tempConsultationData) {
      if (err) {
        return callback(err, null);
      }

      // temp consultation is found (i.e. user accessed URL before their data expired)
      if (tempConsultationData) {
        var consultationData = JSON.parse(JSON.stringify(tempConsultationData)), // copy data
          Consultation = options.persistentConsultationModel,
          consultation;

        delete consultationData[options.URLFieldName];
        consultation = new Consultation(consultationData);

        // save the temporary consultation to the persistent consultation collection
        consultation.save(function(err, savedConsultation) {
          if (err) {
            return callback(err, null);
          }

          TempConsultation.remove(query, function(err) {
            if (err) {
              return callback(err, null);
            }

            if (options.shouldSendConfirmation) {
              sendConfirmationEmail(savedConsultation[options.emailFieldName], null);
            }
            return callback(null, consultation);
          });
        });


        // temp consultation is not found (i.e. user accessed URL after data expired, or something else...)
      } else {
        return callback(null, null);
      }
    });
  };


  /**
   * Resend the verification email to the user given only their email.
   *
   * @func resendVerificationEmail
   * @param {object} email - the user's email address
   */
  var resendVerificationEmail = function(email, callback) {
    var query = {};
    query[options.emailFieldName] = email;

    options.tempConsultationModel.findOne(query, function(err, tempConsultation) {
      if (err) {
        return callback(err, null);
      }

      // user found (i.e. user re-requested verification email before expiration)
      if (tempConsultation) {
        // generate new consultaiton token
        tempConsultation[options.URLFieldName] = randtoken.generate(options.URLLength);
        tempConsultation.save(function(err) {
          if (err) {
            return callback(err, null);
          }

          sendVerificationEmail(getNestedValue(tempConsultation, options.emailFieldName), tempConsultation[options.URLFieldName], function(err) {
            if (err) {
              return callback(err, null);
            }
            return callback(null, true);
          });
        });

      } else {
        return callback(null, false);
      }
    });
  };


  return {
    options: options,
    configure: configure,
    generateTempConsultationModel: generateTempConsultationModel,
    createTempConsultation: createTempConsultation,
    confirmTempConsultation: confirmTempConsultation,
    resendVerificationEmail: resendVerificationEmail,
    sendConfirmationEmail: sendConfirmationEmail,
    sendVerificationEmail: sendVerificationEmail,
  };
};
