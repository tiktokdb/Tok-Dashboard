import Stripe from "stripe";

export function createStripeClient({ stripeSecretKey }) {
  return new Stripe(stripeSecretKey, {
    apiVersion: "2024-12-18.acacia"
  });
}
