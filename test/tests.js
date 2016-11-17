var should = require('chai').should();
var mongoose = require('mongoose');
var nev = require('../index')(mongoose);
var stubTransport = require('nodemailer-stub-transport');
var consultation = require('../examples/express/app/consultationModel'); // sample consultation schema
mongoose.connect('mongodb://localhost/test_database'); // needed for testing

describe('config & set up tests', function() {

    var tempConsultationModel;

    it('Generates a temp consultation model', function(done) {
      nev.generateTempConsultationModel(consultation, function(err, generatedTempConsultationModel) {
        tempConsultationModel = generatedTempConsultationModel;
        done();
      });
    });
  
  describe('Test configuration error throwing', function() {

    var defaultOptions;

    before(function() {
      defaultOptions = JSON.parse(JSON.stringify(nev.options));
    });


    var tests = [
      {field: 'verificationURL', wrongValue: 100, reason: 'type'},
      {field: 'verificationURL', wrongValue: 'someurl', reason: 'value'},
      {field: 'URLLength', wrongValue: 'str', reason: 'type'},
      {field: 'URLLength', wrongValue: -20, reason: 'value'},
      {field: 'URLLength', wrongValue: 5.5, reason: 'value'},
      {field: 'tempConsultationCollection', wrongValue: null, reason: 'type'},
      {field: 'emailFieldName', wrongValue: [], reason: 'type'},
      {field: 'URLFieldName', wrongValue: 5.5, reason: 'type'},
      {field: 'expirationTime', wrongValue: '100', reason: 'type'},
      {field: 'expirationTime', wrongValue: -42, reason: 'value'},
      {field: 'expirationTime', wrongValue: 4.2, reason: 'value'},
    ];

    tests.forEach(function(test) {
      it('should throw an error for invalid ' + test.field + ' ' + test.reason, function(done) {
        var optionsToConfigure = {};
        optionsToConfigure[test.field] = test.wrongValue;
        nev.configure(optionsToConfigure, function(err, options) {
          should.exist(err);
          should.not.exist(options);
          done();
        });
      });
    });

    after(function(done) {
      var newOptions = JSON.parse(JSON.stringify(defaultOptions));
      newOptions.tempConsultationModel = tempConsultationModel;
      newOptions.transportOptions = stubTransport();
      newOptions.persistentConsultationModel = consultation;
//      newOptions.passwordFieldName = 'pw';
      nev.configure(newOptions, done);
    });
  });

});

describe('MongoDB tests', function() {

  var newConsultation, newConsultationURL;

  before(function(done) {
    newConsultation = new consultation({
      email: 'foobar@fizzbuzz.com'
    });

    done();
  });

  it('should create a temporary consultation (createTempConsultation())', function(done) {
    nev.createTempConsultation(newConsultation, function(err, existingPersistentConsultation, newTempConsultation) {
      should.not.exist(err);
      should.not.exist(existingPersistentConsultation);
      should.exist(newTempConsultation);

      nev.options.tempConsultationModel.findOne({
        email: newConsultation.email
      }).exec(function(err, result) {
        should.not.exist(err);
        should.exist(result);
        result.should.have.property('email').with.length(newConsultation.email.length);
        newConsultationURL = result.GENERATED_VERIFYING_URL;
        done();
      });
    });
  });

  it('should put the temporary consultation into the persistent collection (confirmTempConsultation())', function(done) {
    nev.confirmTempConsultation(newConsultationURL, function(err, newConsultation) {
      should.not.exist(err);
      should.exist(newConsultation);

      consultation.findOne({
        email: newConsultation.email
      }).exec(function(err, result) {
        should.not.exist(err);
        should.exist(result);

        result.should.have.property('email').with.length(newConsultation.email.length);
  //      result.should.have.property('pw').with.length(4);

        done();
      });
    });
  });

  after(function(done) {
    consultation.remove().exec(done);
  });
});
