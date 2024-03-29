import bodyParser from 'body-parser'
import timeout from 'connect-timeout'
import express from 'express'
import fileUpload from 'express-fileupload'
import session from 'express-session'
import http from 'http'
import passport from 'passport'
import helmet from 'helmet'
import compression from 'compression'
import { Strategy as LocalStrategy } from 'passport-local'

import { database } from './database'

export module appweb {
  const baseURL: string = '/app-forum/'
  const sessionSecret: string = 't2023ee2bO36uAY6A19yoRyvnOd6yH'
  const amountTime: string = '60m'
  const limitBodyParser: string = '50000mb'
  const pathFrontEnd: string = '../main'
  const pathManager: string = '../front-end/dist'
  const pathPublic: string = '../public'

  export type RequiredAuth = (req: express.Request, res: express.Response, next: express.NextFunction) => void

  export interface Server {
    server: http.Server
    app: express.Express
    auth: appweb.RequiredAuth

    listening(port: number | string): void
  }

  export class User {
    public password?: string
    public name: string = 'Guest'
    public username: string = 'guest'
    public email: string = ''
    public roles: string[] = []
    public urlPhoto: string = ''

    constructor(
      user: { username: string; name: string; email: string; roles: string[]; urlPhoto: string } | undefined = {
        name: '',
        urlPhoto: '',
        email: '',
        username: 'guest',
        roles: []
      }
    ) {
      if (user) {
        this.name = user.name
        this.username = user.username
        this.email = user.email
        this.roles = user.roles
        this.urlPhoto = user.urlPhoto
      }
    }
  }

  class ServerLoad implements Server {
    constructor(
      public server: http.Server,
      public app: express.Express,
      public auth: appweb.RequiredAuth
    ) {}

    public listening(port: number | string = 8080): void {
      this.server.listen(port, () => {
        console.log(`Server is running http://localhost:${port}...`)
      })
    }
  }

  export function config(db: database.DB): appweb.Server {
    const app = express()

    app.use(timeout(amountTime))
    app.use(helmet())
    app.disable('x-powered-by')
    const hour = 1000 * 60 * 60 * 24
    app.use(
      session({
        secret: sessionSecret,
        resave: false,
        saveUninitialized: false,
        cookie: {
          expires: new Date(Date.now() + hour),
          maxAge: hour
        }
      })
    )

    app.use(fileUpload())
    app.use(compression())
    app.use(
      bodyParser.json({
        limit: limitBodyParser
      })
    )

    app.use(
      bodyParser.urlencoded({
        limit: limitBodyParser,
        extended: true
      })
    )

    app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
      if (!req.timedout) {
        next()
      }
    })

    const _local: LocalStrategy = new LocalStrategy(
      (username: string, password: string, done: (a: null, _u: { password: string } | boolean) => void) => {
        if (username != null && username.length > 0) {
          const obj: { username: string; password: string } = {
            username: username,
            password: password
          }

          db.pullSQL("SELECT * FROM tb_user WHERE username = '" + obj.username + "';", (result: unknown[]): void => {
            const user: { username: string; password: string } = result[0] as { username: string; password: string }

            if (!user || user.password != obj.password) {
              return done(null, false)
            }

            user.password = ''
            return done(null, user)
          })
        } else {
          return done(null, false)
        }
      }
    )

    passport.use(_local)

    passport.serializeUser((_user: Express.User, done: (err: Error | null, id?: unknown) => void): void => {
      done(null, (_user as { username: string }).username)
    })

    passport.deserializeUser(
      (_username: string, done: (err: Error | null, user: { username: string }) => void): void => {
        done(null, { username: _username })
      }
    )

    // use passport session
    app.use(passport.initialize())
    app.use(passport.session())

    app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
      if (/\/api\/.*/.test(req.path)) {
        res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate')
        res.setHeader('Expires', '-1')
        res.setHeader('Pragma', 'no-cache')
      } else if (/\/authenticated/.test(req.path)) {
        res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate')
        res.setHeader('Expires', '-1')
        res.setHeader('Pragma', 'no-cache')
      } else {
        res.setHeader('Cache-Control', 'public, max-age=31536000')
      }

      res.setHeader('isAuthenticated', '' + req.isAuthenticated())
      res.setHeader('x-powered-by', 'ASERG - DCC - ICEx - UFMG - Brazil')

      next()
    })

    app.post('/auth/test', (req: express.Request, res: express.Response) => {
      res.send(req.body)
    })

    const passportAuth: express.RequestHandler = passport.authenticate(['local'], {
      session: true
    }) as express.RequestHandler

    app.post('/auth/login', passportAuth, (req: express.Request, res: express.Response) => {
      const user: appweb.User = new appweb.User(
        req.user as { username: string; name: string; email: string; roles: string[]; urlPhoto: string }
      )

      res.send({
        user: user,
        roles: [],
        status: 'connected',
        authenticated: true,
        message: 'User is authenticate'
      })
    })

    app.get('/authenticated', (req: express.Request, res: express.Response): void => {
      if (req.isAuthenticated()) {
        const u: appweb.User = new appweb.User(
          req.user as { username: string; name: string; email: string; roles: string[]; urlPhoto: string }
        )

        db.pullSQL("SELECT * FROM tb_user WHERE username = '" + u.username + "';", (result: unknown[]) => {
          const user: appweb.User = new appweb.User(
            result[0] as { username: string; name: string; email: string; roles: string[]; urlPhoto: string }
          )

          delete user.password

          res.send({
            user: user,
            roles: user.roles,
            status: 'connected',
            authenticated: true,
            message: 'User is authenticate'
          })
        })
      } else {
        res.status(403).send({
          user: null,
          roles: [],
          status: 'disconnected',
          authenticated: false,
          message: 'Forbidden'
        })
      }
    })

    app.get('/logout', (req, res): void => {
      req.logOut(() => {})
      res.status(403).redirect(baseURL)
    })

    const requiredAuthentication: RequiredAuth = (
      req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ): void => {
      if (req.user) {
        next()
      } else {
        res.status(403).redirect(baseURL)
      }
    }

    app.use('/', express.static(pathFrontEnd))
    app.use('/local/', requiredAuthentication, express.static(pathManager))
    app.use('/public/', express.static(pathPublic))

    const server = http.createServer(app)
    return new ServerLoad(server, app, requiredAuthentication)
  }
}
