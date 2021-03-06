'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = slackin;

require('babel-polyfill');

var _express = require('express');

var _express2 = _interopRequireDefault(_express);

var _socket = require('socket.io');

var _socket2 = _interopRequireDefault(_socket);

var _bodyParser = require('body-parser');

var _http = require('http');

var _emailRegex = require('email-regex');

var _emailRegex2 = _interopRequireDefault(_emailRegex);

var _vd = require('vd');

var _vd2 = _interopRequireDefault(_vd);

var _cors = require('cors');

var _cors2 = _interopRequireDefault(_cors);

var _superagent = require('superagent');

var _superagent2 = _interopRequireDefault(_superagent);

var _slack = require('./slack');

var _slack2 = _interopRequireDefault(_slack);

var _slackInvite = require('./slack-invite');

var _slackInvite2 = _interopRequireDefault(_slackInvite);

var _badge = require('./badge');

var _badge2 = _interopRequireDefault(_badge);

var _splash = require('./splash');

var _splash2 = _interopRequireDefault(_splash);

var _iframe = require('./iframe');

var _iframe2 = _interopRequireDefault(_iframe);

var _log = require('./log');

var _log2 = _interopRequireDefault(_log);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

// our code


// their code
function slackin(_ref) {
  var token = _ref.token,
      _ref$interval = _ref.interval,
      interval = _ref$interval === undefined ? 5000 : _ref$interval,
      org = _ref.org,
      gcaptcha_secret = _ref.gcaptcha_secret,
      gcaptcha_sitekey = _ref.gcaptcha_sitekey,
      css = _ref.css,
      coc = _ref.coc,
      _ref$cors = _ref.cors,
      useCors = _ref$cors === undefined ? false : _ref$cors,
      _ref$path = _ref.path,
      path = _ref$path === undefined ? '/' : _ref$path,
      channels = _ref.channels,
      emails = _ref.emails,
      _ref$silent = _ref.silent,
      silent = _ref$silent === undefined ? false : _ref$silent;

  // must haves
  if (!token) throw new Error('Must provide a `token`.');
  if (!org) throw new Error('Must provide an `org`.');
  if (!gcaptcha_secret) throw new Error('Must provide a `gcaptcha_secret`.');
  if (!gcaptcha_sitekey) throw new Error('Must provide an `gcaptcha_sitekey`.');

  if (channels) {
    // convert to an array
    channels = channels.split(',').map(function (channel) {
      // sanitize channel name
      if (channel[0] === '#') return channel.substr(1);
      return channel;
    });
  }

  if (emails) {
    // convert to an array
    emails = emails.split(',');
  }

  // setup app
  var app = (0, _express2.default)();
  var srv = (0, _http.Server)(app);
  srv.app = app;

  var assets = __dirname + '/assets';

  // fetch data
  var slack = new _slack2.default({ token: token, interval: interval, org: org });

  slack.setMaxListeners(Infinity);

  // capture stats
  (0, _log2.default)(slack, silent);

  // middleware for waiting for slack
  app.use(function (req, res, next) {
    if (slack.ready) return next();
    slack.once('ready', next);
  });

  if (useCors) {
    app.options('*', (0, _cors2.default)());
    app.use((0, _cors2.default)());
  }

  // splash page
  app.get('/', function (req, res) {
    var _slack$org = slack.org,
        name = _slack$org.name,
        logo = _slack$org.logo;
    var _slack$users = slack.users,
        active = _slack$users.active,
        total = _slack$users.total;

    if (!name) return res.send(404);
    var page = (0, _vd2.default)('html', (0, _vd2.default)('head', (0, _vd2.default)('title', 'Join ', name, ' on Slack!'), (0, _vd2.default)('script src=https://www.google.com/recaptcha/api.js'), (0, _vd2.default)('meta name=viewport content="width=device-width,initial-scale=1.0,minimum-scale=1.0,user-scalable=no"'), (0, _vd2.default)('link rel="shortcut icon" href=https://slack.global.ssl.fastly.net/272a/img/icons/favicon-32.png'), css && (0, _vd2.default)('link rel=stylesheet', { href: css })), (0, _splash2.default)({
      coc: coc,
      path: path,
      css: css,
      name: name,
      org: org,
      logo: logo,
      channels: channels,
      active: active,
      total: total,
      gcaptcha_sitekey: gcaptcha_sitekey
    }));
    res.type('html');
    res.send(page.toHTML());
  });

  app.get('/data', function (req, res) {
    var _slack$org2 = slack.org,
        name = _slack$org2.name,
        logo = _slack$org2.logo;
    var _slack$users2 = slack.users,
        active = _slack$users2.active,
        total = _slack$users2.total;

    res.send({
      name: name,
      org: org,
      coc: coc,
      logo: logo,
      channels: channels,
      active: active,
      total: total
    });
  });

  // static files
  app.use('/assets', _express2.default.static(assets));

  // invite endpoint
  app.post('/invite', (0, _bodyParser.json)(), function (req, res, next) {
    var chanId = void 0;
    if (channels) {
      var channel = req.body.channel;
      if (!channels.includes(channel)) {
        return res.status(400).json({ msg: 'Not a permitted channel' });
      }
      chanId = slack.getChannelId(channel);
      if (!chanId) {
        return res.status(400).json({ msg: 'Channel not found "' + channel + '"' });
      }
    }

    var email = req.body.email;
    var captcha_response = req.body['g-recaptcha-response'];

    if (!email) {
      return res.status(400).json({ msg: 'No email provided' });
    }

    if (captcha_response == undefined || !captcha_response.length) {
      return res.status(400).send({ msg: 'Invalid captcha' });
    }

    if (!(0, _emailRegex2.default)().test(email)) {
      return res.status(400).json({ msg: 'Invalid email' });
    }

    // Restricting email invites?
    if (emails && emails.indexOf(email) === -1) {
      return res.status(400).json({ msg: 'Your email is not on the accepted email list' });
    }

    if (coc && req.body.coc != '1') {
      return res.status(400).json({ msg: 'Agreement to CoC is mandatory' });
    }

    // / //////////////////////////////////////////////////////////////////////

    var captcha_data = {
      secret: gcaptcha_secret,
      response: captcha_response,
      remoteip: req.connection.remoteAddress
    };

    var captcha_callback = function captcha_callback(err, resp) {
      if (err) {
        return res.status(400).send({ msg: err });
      } else {
        if (resp.body.success) {
          var _chanId = slack.channel ? slack.channel.id : null;

          (0, _slackInvite2.default)({ token: token, org: org, email: email, channel: _chanId }, function (err) {
            if (err) {
              if (err.message === 'Sending you to Slack...') {
                return res.status(303).json({
                  msg: err.message,
                  redirectUrl: 'https://' + org + '.slack.com'
                });
              }

              return res.status(400).json({ msg: err.message });
            }

            res.status(200).json({ msg: 'WOOT. Check your email!' });
          });
        } else {
          if (err) {
            return res.status(400).send({ msg: 'Captcha check failed' });
          }
        }
      }
    };

    _superagent2.default.post('https://www.google.com/recaptcha/api/siteverify').type('form').send(captcha_data).end(captcha_callback);
  });

  // iframe
  app.get('/iframe', function (req, res) {
    var large = 'large' in req.query;
    var _slack$users3 = slack.users,
        active = _slack$users3.active,
        total = _slack$users3.total;

    res.type('html');
    res.send((0, _iframe2.default)({ path: path, active: active, total: total, large: large }).toHTML());
  });

  app.get('/iframe/dialog', function (req, res) {
    var large = 'large' in req.query;
    var name = slack.org.name;
    var _slack$users4 = slack.users,
        active = _slack$users4.active,
        total = _slack$users4.total;

    if (!name) return res.send(404);
    var page = (0, _vd2.default)('html', (0, _vd2.default)('script src=https://www.google.com/recaptcha/api.js'), (0, _splash2.default)({
      coc: coc,
      path: path,
      name: name,
      org: org,
      channels: channels,
      active: active,
      total: total,
      large: large,
      iframe: true,
      gcaptcha_sitekey: gcaptcha_sitekey
    }));
    res.type('html');
    res.send(page.toHTML());
  });

  app.get('/.well-known/acme-challenge/:id', function (req, res) {
    res.send(process.env.LETSENCRYPT_CHALLENGE);
  });

  // badge js
  app.use('/slackin.js', _express2.default.static(assets + '/badge.js'));

  // badge rendering
  app.get('/badge.svg', function (req, res) {
    res.type('svg');
    res.set('Cache-Control', 'max-age=0, no-cache');
    res.set('Pragma', 'no-cache');
    res.send((0, _badge2.default)(slack.users).toHTML());
  });

  // realtime
  (0, _socket2.default)(srv).on('connection', function (socket) {
    socket.emit('data', slack.users);
    var change = function change(key, val) {
      return socket.emit(key, val);
    };
    slack.on('change', change);
    socket.on('disconnect', function () {
      slack.removeListener('change', change);
    });
  });

  return srv;
} // es6 runtime requirements