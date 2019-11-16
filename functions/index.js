const functions = require('firebase-functions');
const admin = require('firebase-admin');
const fetch = require('node-fetch');
const querystring = require('querystring');
const cheerio = require('cheerio');

admin.initializeApp(functions.config().firebase);

exports.handleUserSignUp = functions.auth.user().onCreate(user => {
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
      'id,guid,name,deck,description,image,original_release_date,platforms,site_detail_url,expected_release_day,expected_release_month,expected_release_year',
    limit: 10,
    page: page
  };

  fetch(`${url}?${querystring.stringify(requestParams)}`)
    .then(res => res.json())
    .then(json => {
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

exports.selectGameOfTheMonth = functions.https.onRequest((request, response) => {
  const { gameID, month, year } = request.body;

  fetch(`https://www.giantbomb.com/api/game/${gameID}?api_key=${config.giantbomb.apikey}`)
    .then(res => res.json())
    .then(game => {
      // return {
      //   giantBombID: `${apiResponse.id}`,
      //   title: apiResponse.name,
      //   releaseDate: apiResponse.original_release_date
      //     ? apiResponse.original_release_date
      //     : new Date(
      //         apiResponse.expected_release_year,
      //         apiResponse.expected_release_month - 1,
      //         apiResponse.expected_release_day
      //       ).toISOString(),
      //   coverURL: apiResponse.image.original_url,
      //   current: currentGame,
      //   activeMonth: activeMonth,
      //   activeYear: activeYear,
      //   platforms: platforms,
      //   description: descriptionText,
      //   storeLinks: []
      // };

      const platforms = game.platforms.map(p => ({ id: p.id, name: p.name }));

      let descriptionText = '';
      if (game.description) {
        const $ = cheerio.load(game.description);

        descriptionText = $('h2')
          .first()
          .nextUntil('h2')
          .text();
      }

      const suggestionDoc = {
        giantBombID: game.id,
        title: game.name,
        releaseDate: game.original_release_date
          ? game.original_release_date
          : new Date(
              game.expected_release_year,
              game.expected_release_month + 1,
              game.expected_release_day
            ).toISOString(),
        coverURL: game.image.original_url,
        current: true,
        activeMonth: month,
        activeYear: year,
        platforms: platforms,
        giantBombLink: game.site_detail_url,
        description: descriptionText,
        user: {
          userID: '',
          userName: ''
        },
        storeLinks: []
      };

      const firestore = admin.firestore();
      return firestore.collection('games').add(suggestionDoc);
    })
    .then(doc => {
      const firestore = admin.firestore();
      // TODO: ditch the current flag altogther so that it doesn't need to be updated
      firestore
        .collection('games')
        .where('current', '==', true)
        .get()
        .then(snapshot => {
          const ids = snapshot.docs.map(d => d.id).filter(id => id !== doc.id);
          return Promise.all(ids.map(id => games.doc(id).update({ current: false })));
        })
        .then(() => response.status(201).send({ id: doc.id }));
    })

    .catch(() => response.sendStatus(500));
});
