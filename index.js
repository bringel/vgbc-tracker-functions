const functions = require('firebase-functions');
const admin = require('firebase-admin');
const fetch = require('node-fetch');
const querystring = require('querystring');

admin.initializeApp(functions.config().firebase);

exports.handleUserSignUp = functions.auth.user().onCreate((user) => {
  const firestore = admin.firestore();

  admin.auth().setCustomUserClaims(user.uid, { role: 'user' });

  return firestore
    .collection('users')
    .doc(user.uid)
    .set(
      {
        email: user.email,
        role: 'user'
      },
      { merge: true }
    );
});

exports.updateRole = functions.https.onRequest((request, response) => {
  const { userID, role } = request.body;

  const firestore = admin.firestore();
  const auth = admin.auth();

  const authorization = request.headers.authorization;
  const tokenMatcher = /Bearer (.*)/;

  if (tokenMatcher.test(authorization)) {
    const [_, token] = tokenMatcher.exec(authorization);

    return auth
      .verifyIdToken(token)
      .then(() => {
        return auth.setCustomUserClaims(userID, { role });
      })
      .then(() => {
        return firestore
          .collection('users')
          .doc(userID)
          .set({ role }, { merge: true });
      })
      .then(() => {
        return response.sendStatus(200);
      })
      .catch(() => {
        response.sendStatus(403);
      });
  } else {
    return response.sendStatus(403);
  }
});

exports.searchForGame = functions.https.onRequest((request, response) => {
  const url = 'https://www.giantbomb.com/api/search/';
  const config = functions.config();
  const gameTitle = request.query.title;
  const page = request.query.page || 1;
  const limit = 10;

  const requestParams = {
    api_key: config.giantbomb.apikey,
    format: 'json',
    resources: 'game',
    query: gameTitle,
    field_list:
      'id,name,deck,description,image,original_release_date,platforms,site_detail_url,expected_release_day,expected_release_month,expected_release_year',
    limit: 10,
    page: page
  };

  fetch(`${url}?${querystring.stringify(requestParams)}`)
    .then((res) => res.json())
    .then((json) => {
      const { results, number_of_total_results: totalResults, offset } = json;
      const currentPage = (offset + limit) / limit;
      const totalPages = Math.ceil(totalResults / limit);
      const payload = {
        currentPage,
        totalPages,
        results
      };
      return response.json(payload);
    })
    .catch(() => response.sendStatus(500));
});
