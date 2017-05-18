# Fonctionnement

Ce module permet de confirmer par email une demande de déploiement de consultation. 

Cela fonctionne de la façon suivante : 

- une consultation temporaire est créée avec une random URL qui lui est assignée et stocké dans la collection temporaire mongoDB ; 
- un email est envoyé à l'adresse email renseignée par la personne demandeuse. Cet email contient l'URL précédemment stockée ;
- quand l'URL est accédée (c.a.d que la personne confirme la demande de déploiement), les données de la consultation sont transférée dans la collection permanente.

Une consultation temporaire a un TTL de 24h par défaut mais cela peut-être configuré. 

Ce module est utilisé par l'application consultation-gouv/deploiement.consultation

## Guide d'installation

### Step 1: ajouter les dépendances
All of the code in this section takes place in server.js. Note that `mongoose` has to be passed as an argument when requiring the module:

```javascript
const mongoose = require('mongoose');
//main module to verify and confirm a consultation deployment request
const ocv = require('ogp-consultation-verification')(mongoose);
//importation of  model mongoose for consultation
const consultation = require('../models/consultation');
```

### Step 2: Configuration

Dans un fichier séparé par exemple : /helper/ocv-config.js

```javascript
module.exports = function(consultation) {
    return {
        persistentConsultationModel: consultation,
        expirationTime: 1200, // 20 minutes
        verificationURL: process.env.URLPLATFORM + '/confirmation/${URL}',
        emailFieldName: 'adminEmail',
        transportOptions: {
            service: 'Sendgrid',
            auth: {
                user: process.env.SENDGRIDUSER,
                pass: process.env.SENDGRIDPASS
            }
        },
        verifyMailOptions: {
            from: 'consultation.etalab.gouv.fr <ne-pas-repondre@consultation.etalab.gouv.fr>',
            subject: 'Confirmez votre demande de consultation',
            html: '<p>Merci de confirmer votre demande en cliquant sur  <a href="${URL}">ce lien</a>. Si cela ne fonctionne pas, ' +
            'copier et coller le lien suivant dans la barre d adresse de votre navigateur :</p><p>${URL}</p>',
            text: 'Merci de confirmer votre demande en cliquant sur {URL}'
        },
        confirmMailOptions: {
            from: 'consultation.etalab.gouv.fr <ne-pas-repondre@consultation.etalab.gouv.fr>',
            subject: 'Demande de consultation confirmée ! ',
            html: '<p>Votre demande de consultation a été confirmée. Le déploiement est en cours. Vous recevrez un e-mail avec des instructions dans quelques minutes.</p>',
            text: 'Votre demande de consultation a été confirmée. Le déploiement est en cours. Vous recevrez un e-mail avec des instructions dans quelques minutes.'
        }
    }
}

```

### Step 3: Créer un model de consultation temporaire

Le model de consultation temportaire est généré automatiquement à partir du modèle de consultation. Un champ lui ai ajouté "GENERATED_VERIFYING_URL: String"

### Step 4: Confirmer la consultation et la sauvegarder dans la collection permanente

Pour transférer une consultation de la collection temporaire à la collection permanente, il est fait appel à la fonction `confirmTempConsultation`, qui prend l'URL ainsi que le callback avec 2 paramètres (une erreur et l'instance de la consultation ou `null` si il y a eu des erreurs ou si la consultation n'est pas trouvée (expirée...)).


## Options

```javascript
const options = {
    verificationURL: 'http://example.com/consfirmation/${URL}',
    URLLength: 48,

    tempConsultationCollection: 'consultation',
    emailFieldName: 'email',
    passwordFieldName: 'password',
    URLFieldName: 'GENERATED_VERIFYING_URL',
    expirationTime: 86400,

    // emailing options
    transportOptions: {
        service: 'Sendgrid',
        auth: {
            user: process.env.SENDGRIDUSER,
            pass: process.env.SENDGRIDPASS
        }
    },
     verifyMailOptions: {
            from: 'consultation.etalab.gouv.fr <ne-pas-repondre@consultation.etalab.gouv.fr>',
            subject: 'Confirmez votre demande de consultation',
            html: '<p>Merci de confirmer votre demande en cliquant sur  <a href="${URL}">ce lien</a>. Si cela ne fonctionne pas, ' +
            'copier et coller le lien suivant dans la barre d adresse de votre navigateur :</p><p>${URL}</p>',
            text: 'Merci de confirmer votre demande en cliquant sur {URL}'
        },
        confirmMailOptions: {
            from: 'consultation.etalab.gouv.fr <ne-pas-repondre@consultation.etalab.gouv.fr>',
            subject: 'Demande de consultation confirmée ! ',
            html: '<p>Votre demande de consultation a été confirmée. Le déploiement est en cours. Vous recevrez un e-mail avec des instructions dans quelques minutes.</p>',
            text: 'Votre demande de consultation a été confirmée. Le déploiement est en cours. Vous recevrez un e-mail avec des instructions dans quelques minutes.'
        }
    
}
```
# TEST

```
npm test
```
