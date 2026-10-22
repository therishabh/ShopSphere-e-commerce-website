// `/api/v1` ka router: API ke saare routes yahin se jude hain.
// Is file ko prefixes aur parsers ki jaankari hai; har feature ke andar ka detail uske apne module mein hai.

// `express` default export (json/urlencoded parsers ke liye) aur `Router` named export dono chahiye.
import express, { Router } from 'express';
// Feature modules: abhi sab khaali hain (URL space reserved); apne-apne phase mein bharenge.
import { createAuthRouter } from '../modules/auth/auth.routes.js';
import { createUsersRouter } from '../modules/users/users.routes.js';
import { createSellersRouter } from '../modules/sellers/sellers.routes.js';
import { createProductsRouter } from '../modules/products/products.routes.js';
import { createCartRouter } from '../modules/cart/cart.routes.js';
import { createAdminOrdersRouter, createOrdersRouter } from '../modules/orders/orders.routes.js';
import { createAdminRouter } from '../modules/admin/admin.routes.js';
import { createCategoriesRouter } from '../modules/categories/categories.routes.js';
import { createReviewsRouter } from '../modules/reviews/reviews.routes.js';
import { createWishlistRouter } from '../modules/wishlist/wishlist.routes.js';
// Authorization (role/permission/ownership), browser sessions (Redis) aur seller/admin/products ke asli modules (Phase 8).
import { createAuthz } from '../modules/authz/index.js';
import { createAuthenticateEither } from '../modules/authz/authenticate-either.js';
import { createSessionModule } from '../modules/session/index.js';
import { createSessionRegistry } from '../modules/session/session-registry.js';
import { createSellerService } from '../modules/sellers/sellers.service.js';
import { createSellersController } from '../modules/sellers/sellers.controller.js';
import { createAdminService } from '../modules/admin/admin.service.js';
import { createAdminController } from '../modules/admin/admin.controller.js';
import { createProductService } from '../modules/products/products.service.js';
import { createProductsController } from '../modules/products/products.controller.js';
import { createCategoryService } from '../modules/categories/categories.service.js';
import { createCategoriesController } from '../modules/categories/categories.controller.js';
import { createReviewService } from '../modules/reviews/reviews.service.js';
import { createReviewsController } from '../modules/reviews/reviews.controller.js';
import { createWishlistService } from '../modules/wishlist/wishlist.service.js';
import { createWishlistController } from '../modules/wishlist/wishlist.controller.js';
// Phase 10: cart, orders (checkout, state machine) aur mock payment provider.
import { createCartService } from '../modules/cart/cart.service.js';
import { createCartController } from '../modules/cart/cart.controller.js';
import { createOrderService } from '../modules/orders/orders.service.js';
import { createOrdersController } from '../modules/orders/orders.controller.js';
import { createMockPaymentProvider } from '../payments/mock-payment-provider.js';
// Teaching examples: sirf seekhne/demo ke liye, production mein mount nahi hote.
import { createHttpExamplesRouter } from '../examples/http-examples.routes.js';
import { createMiddlewareExamplesRouter } from '../examples/middleware-examples.routes.js';
import { createMailboxExamplesRouter } from '../examples/mailbox-examples.routes.js';
// Auth module (database ho tabhi asli endpoints) aur test mailer (abhi ke liye email delivery).
import { createAuthModule } from '../modules/auth/index.js';
import { createTestMailer } from '../email/test-mailer.js';
import { createErrorExamplesRouter } from '../examples/error-examples.routes.js';
import { createValidationExamplesRouter } from '../examples/validation-examples.routes.js';

// Request body ki maximum size. Isse bada body bhejne par 413 (Payload Too Large) milta hai,
// taaki koi bahut bada body bhejkar server ki memory na kha sake.
export const BODY_LIMIT = '100kb';

/**
 * `/api/v1` par mount hone wala router. Andar ka order jaan-boojh kar aisa hai:
 *   1. body parsers (sirf API routes par lagte hain, explicit size limit ke saath)
 *   2. feature module routers
 *   3. teaching examples (sirf non-production mein)
 * Jo request yahan match nahi hoti wo app-level 404 handler tak jaati hai.
 */
export function createApiRouter({ config, database, redis, logger }) {
  const api = Router();
  // Emails ke liye abhi sirf test mailer (memory mein jama). Asli provider adapter baad mein isi jagah lagega.
  const mailer = createTestMailer({ logger });

  // Parsers routes se PEHLE hone chahiye, warna handler ko `req.body` khaali milega.
  // express.json: `Content-Type: application/json` wali body ko JS object banata hai (req.body).
  api.use(express.json({ limit: BODY_LIMIT }));
  // express.urlencoded: HTML form wali body (`a=1&b=2`) parse karta hai.
  // `extended: false` = simple parsing; `a[b]=1` jaisi nested keys object mein expand nahi hoti (zyada safe).
  api.use(express.urlencoded({ extended: false, limit: BODY_LIMIT }));

  // Har feature ka router apne prefix par mount hota hai: e.g. /api/v1/auth/...
  // Auth ko users/tokens store karne ke liye database chahiye. Database nahi hai (tests, ya MONGODB_URI set nahi) to auth khaali
  // router rehta hai: koi fake endpoint nahi, request seedha 404.
  //
  // Composition (jodna): database ho to auth + authz; Redis bhi ho to browser sessions bhi. Kuch na ho to wo hisse khaali routers.
  let routes = {};
  if (database) {
    // Browser sessions (Redis): registry pehle (auth ko password reset par sessions revoke karne ke liye chahiye).
    const sessionRegistry = redis
      ? createSessionRegistry({
          redis: redis.client,
          absoluteSeconds: config.session.absoluteHours * 3600,
        })
      : undefined;
    const auth = createAuthModule({ config, database, logger, mailer, sessions: sessionRegistry });
    const session = redis
      ? createSessionModule({
          config,
          database,
          redis,
          logger,
          authService: auth.authService,
          registry: sessionRegistry,
        })
      : undefined;
    // express-session cookie padhne wala middleware: sirf tab store (Redis) ko chhuta hai jab request mein session cookie ho.
    if (session) api.use(session.middleware);

    // Bearer YA session: Authorization header ho to sirf bearer, warna cookie (CSRF ke saath). Authorization dono ke baad ek jaisa.
    const authenticate = createAuthenticateEither({
      bearer: auth.authenticate,
      session: session?.authenticate,
    });
    const { requirePermission } = createAuthz({ database, logger });
    const deps = { authenticate, requirePermission };
    // Orders ka ek controller seedha customer, seller aur admin teeno routers ko jaata hai (service ek hi, rules ek hi jagah).
    const ordersController = createOrdersController({
      orderService: createOrderService({
        database,
        payments: createMockPaymentProvider({ logger }),
        logger,
      }),
    });
    routes = {
      auth: auth.router,
      session: session?.router,
      sellers: createSellersRouter({
        ...deps,
        controller: createSellersController({ sellerService: createSellerService({ database }) }),
      }),
      products: createProductsRouter({
        ...deps,
        controller: createProductsController({
          productService: createProductService({ database, logger }),
        }),
      }),
      admin: createAdminRouter({
        ...deps,
        controller: createAdminController({ adminService: createAdminService({ database }) }),
      }),
      // Phase 9: public categories, reviews (do prefixes: /products/:id/reviews aur /reviews/:id) aur wishlist.
      categories: createCategoriesRouter({
        controller: createCategoriesController({
          categoryService: createCategoryService({ database }),
        }),
      }),
      reviews: createReviewsRouter({
        ...deps,
        controller: createReviewsController({
          reviewService: createReviewService({ database, logger }),
        }),
      }),
      wishlist: createWishlistRouter({
        ...deps,
        controller: createWishlistController({
          wishlistService: createWishlistService({ database }),
        }),
      }),
      cart: createCartRouter({
        ...deps,
        controller: createCartController({ cartService: createCartService({ database }) }),
      }),
      orders: createOrdersRouter({ ...deps, controller: ordersController }),
      adminOrders: createAdminOrdersRouter({ ...deps, controller: ordersController }),
    };
  }

  api.use('/auth', routes.auth ?? createAuthRouter());
  api.use('/session', routes.session ?? Router());
  api.use('/users', createUsersRouter());
  api.use('/sellers', routes.sellers ?? createSellersRouter());
  api.use('/products', routes.products ?? createProductsRouter());
  api.use('/categories', routes.categories ?? createCategoriesRouter());
  api.use('/wishlist', routes.wishlist ?? createWishlistRouter());
  // Reviews ke paths do alag prefixes par hain (/products/:id/reviews, /reviews/:id), isliye root par mount; poore paths router mein.
  api.use(routes.reviews ?? createReviewsRouter());
  api.use('/cart', routes.cart ?? createCartRouter());
  api.use('/orders', routes.orders ?? createOrdersRouter());
  // `/admin/orders` ko `/admin` se pehle mount karo (zyada specific prefix pehle), warna admin router use pehle pakad leta.
  api.use('/admin/orders', routes.adminOrders ?? createAdminOrdersRouter());
  api.use('/admin', routes.admin ?? createAdminRouter());

  // Teaching examples production mein expose nahi hone chahiye (wo real feature nahi hain).
  if (config.env !== 'production') {
    // Zyada specific prefixes pehle mount karo: '/examples/middleware' ko '/examples' se pehle,
    // warna '/examples' wala router unke requests pehle pakad leta.
    api.use('/examples/mailbox', createMailboxExamplesRouter(mailer));
    api.use('/examples/middleware', createMiddlewareExamplesRouter());
    api.use('/examples/errors', createErrorExamplesRouter());
    api.use('/examples/validation', createValidationExamplesRouter());
    api.use('/examples', createHttpExamplesRouter());
  }

  return api;
}
