import bodyParser from "body-parser";
import timeout from "connect-timeout";
import express from "express";
import fileUpload from "express-fileupload";
import session from "express-session";
import http from "http";
import passport from "passport";

// import passport_google from "passport-google-oauth";

const LocalStrategy = require('passport-local').Strategy

import Strategy from 'passport-ldapauth';
import {database} from "./database";

const bcrypt = require('bcryptjs');

declare var LdapStrategy: any;

export module appweb
{
  /*
  const GOOGLE_CLIENT_ID = "101449207194-crskn72gc2leis4e7kd4bqjh2f5a1ckt.apps.googleusercontent.com";
  const GOOGLE_CLIENT_SECRET = "t2bO36uAY6A19yoRyvnOd6yH";
  const GoogleStrategy = passport_google.OAuth2Strategy;
  */

  const baseURL: string = '/app-forum/';

  const successRedirect: string = baseURL + "app-forum/";
  const failureRedirect: string = "";
  const sessionSecret: string = "t2023ee2bO36uAY6A19yoRyvnOd6yH";
  const amountTime: string = "60m";
  const limitBodyParser: string = "50000mb";

  const pathFrontEnd: string = "../main";
  const pathManager: string = "../front-end/dist";
  const pathPublic: string = "../public";

  export interface Server {

    server: http.Server;
    app: express.Express;
    auth: any;

    listening(port: number|string): void;
  }

  export class User
  {
    public name: string = 'Guest';
    public username: string = 'guest';
    public email: string = '';
    public roles: string[] = [];
    public urlPhoto: string = '';

    constructor(user: any = {username: 'guest'})
    {
      if (user)
      {
        this.name = user.name_user;
        this.username = (user.username || 'guest');
        this.email = (user.email || (this.username + '@dcc.ufmg.br'));
        this.roles = (user.roles || []);
        this.urlPhoto = user.urlPhoto
      }
    }
  }

  class ServerLoad implements Server
  {
    constructor(
        public server: http.Server,
        public app: express.Express,
        public auth: any) {}

    public listening(port: number|string = 8080): void
    {
      this.server.listen(port, () => { console.log(`Server is running http://localhost:${port}...`); });
    }
  }

  export const config: any = (db: database.DB,
                              port: number|string = 8080,
                              protocolo: string = "http",
                              domain: string = "localhost"): appweb.Server => {
    const app = express();

    app.use(timeout(amountTime));

    const hour = 1000 * 60 * 60 * 24;
    app.use(
        session({
          secret: sessionSecret,
          resave: false,
          saveUninitialized: false,
          cookie: {
            expires: new Date(Date.now() + hour),
            maxAge: hour
          }
        }));

    app.use(fileUpload());

    app.use(
        bodyParser.json({
          limit: limitBodyParser
        }));

    app.use(
        bodyParser.urlencoded({
          limit: limitBodyParser,
          extended: true
        }));

    app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
      if (!req.timedout)
      {
        next();
      }
    });

    /*
    passport.use(
        new GoogleStrategy(
            {
              clientID: GOOGLE_CLIENT_ID,
              clientSecret: GOOGLE_CLIENT_SECRET,
              callbackURL: protocolo + "://" + domain + ":" + port + "/auth/google/callback"
            },
            (token, tokenSecret, profile, done) => {
              done(null, profile);
            }));
    */

    passport.use(new LocalStrategy((username: string, password: string, done: any) => {
      const obj: {username: string, password: string} = {username: username, password: password};

      db.pullSQL("SELECT * FROM tb_user WHERE username = '" + obj.username + "';", (result: any) => {
        let user: any = result[0];

        if (!user)
        {
          return done(null, false);
        }

        if (!user && (user.password == '' || user.password == null))
        {
          return done(null, false);
        }

        if (!user && (user.password != obj.password))
        {
          return done(null, false);
        }

        delete user.password;

        return done(null, user);
      });
    }));

    passport.serializeUser((user: any, done: any) => {
      done(null, user);
    });

    passport.deserializeUser((user: any, done: any) => {
      done(null, user);
    });

    // use passport session
    app.use(passport.initialize());
    app.use(passport.session());

    app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
      if (/\/api\/.*/.test(req.path))
      {
        res.setHeader("Cache-Control", "private, no-cache, no-store, must-revalidate");
        res.setHeader("Expires", "-1");
        res.setHeader("Pragma", "no-cache");
      }
      else if (/\/authenticated/.test(req.path))
      {

        res.setHeader("Cache-Control", "private, no-cache, no-store, must-revalidate");
        res.setHeader("Expires", "-1");
        res.setHeader("Pragma", "no-cache");
      }
      else
      {
        res.setHeader("Cache-Control", "public, max-age=31536000");
      }

      res.setHeader("isAuthenticated", '' + req.isAuthenticated());
      res.setHeader("x-powered-by", "ASERG - DCC - ICEx - UFMG - Brazil");

      next();
    });

    app.post('/auth/test', (req: express.Request, res: express.Response) => {
      res.send(req.body);
    });

    app.post('/auth/login', passport.authenticate(['local'], {session: true}), (req: express.Request, res: express.Response) => {
      let user: appweb.User = new appweb.User(req.user);

      res.send({
        user: user,
        roles: [],
        status: "connected",
        authenticated: true,
        message: "User is authenticate"
      });
    });

    /*
    app.get("/auth/google", passport.authenticate("google", {scope: ["email profile"]}));

    app.get("/auth/google/callback", passport.authenticate("google", {failureRedirect}), (req: express.Request, res: express.Response) => {
      // Authenticated successfully
      res.redirect(successRedirect);
    });
    */

    app.get("/authenticated", (req: express.Request, res: express.Response): void => {
      if (req.isAuthenticated())
      {
        let u: appweb.User = new appweb.User(req.user);

        db.pullSQL("SELECT * FROM tb_user WHERE username = '" + u.username + "';", (result: any) => {
          let user: any = new appweb.User(result[0]);

          delete user.password;

          res.send({
            user: user,
            roles: user.roles,
            status: "connected",
            authenticated: true,
            message: "User is authenticate",
          });
        });
      }
      else
      {

        res.status(403).send({
          user: null,
          roles: [],
          status: "disconnected",
          authenticated: false,
          message: 'Forbidden'
        });
      }
    });

    app.get("/logout", (req, res): void => {
      req.logOut(() => {});
      res.status(403).redirect(baseURL);
    });

    const requiredAuthentication = (req: express.Request,
                                    res: express.Response,
                                    next: express.NextFunction): void => {
      if (req.user)
      {
        next();
      }
      else
      {
        res.status(403).redirect(baseURL);
      }
    };

    app.use("/", express.static(pathFrontEnd));
    app.use("/local/", requiredAuthentication, express.static(pathManager));
    app.use("/public/", express.static(pathPublic));

    const server = http.createServer(app);
    return new ServerLoad(server, app, requiredAuthentication);
  };
}
