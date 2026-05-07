import type { MetaFunction, ActionFunctionArgs } from "react-router";
import { Form, useActionData, useNavigation } from "react-router";
import { Header } from "../components/home/Header";
import { Footer } from "../components/home/Footer";
import { useState } from "react";
import { users } from "@edicut/db/schema";
import { findUserByEmail } from "@edicut/db/repositories/users";
// Assume bcrypt-edge or similar works. For now using pure js bcryptjs
import bcrypt from "bcryptjs";
import { createUserSession } from "../lib/session.server";
import { getDbFromContext } from "../lib/db.server";
import { verifyPassword } from "../lib/password.server";

export const meta: MetaFunction = () => {
  return [
    { title: "Sign in - EdiCut" },
    { name: "description", content: "Sign in or create an account with EdiCut" },
  ];
};

export async function action({ request, context }: ActionFunctionArgs) {
  const formData = await request.formData();
  const intent = formData.get("intent") as string;
  const email = (formData.get("email") as string).trim().toLowerCase();
  const password = formData.get("password") as string;
  const remember = formData.get("remember") === "on";
  
  if (!email || !password || password.length < 6 || typeof email !== "string" || typeof password !== "string") {
    return { error: "Invalid email or password (min 6 characters)." };
  }

  const db = getDbFromContext(context);

  if (intent === "signup") {
    const name = formData.get("name") as string;
    const existing = await findUserByEmail(db, email);
    if (existing) {
      return { error: "User with this email already exists." };
    }
    
    // Hash password
    const salt = bcrypt.genSaltSync(10);
    const passwordHash = bcrypt.hashSync(password, salt);
    
    const [user] = await db.insert(users).values({
      email,
      name: name || null,
      passwordHash
    }).returning();
    
    // Create session
    return createUserSession({ request, context, userId: user.id, remember, redirectTo: "/dashboard" });
  }

  // Handle Login
  if (intent === "signin") {
    const user = await findUserByEmail(db, email);
    if (!user || !user.passwordHash) {
      return { error: "Invalid credentials." };
    }
    
    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
      return { error: "Invalid credentials." };
    }
    
    return createUserSession({ request, context, userId: user.id, remember, redirectTo: "/dashboard" });
  }

  return { error: "Unknown intent" };
}

export default function Signin() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  return (
    <div className="min-h-screen bg-white font-sans text-black">
      <Header />
      <main className="flex min-h-[calc(100vh-4rem)]">
        <section className="flex flex-col justify-center w-full md:w-1/2 p-8 md:p-16 lg:p-24 bg-white">
          <div className="max-w-md mx-auto w-full">
            <div className="mb-8">
              <span className="text-2xl font-black tracking-tighter text-[#FF0000]">EdiCut</span>
            </div>
            <h1 className="text-3xl font-bold mb-2">
              {isSignUp ? "Create an account" : "Sign in to EdiCut"}
            </h1>
            <p className="text-sm text-gray-500 mb-6">
              {isSignUp 
                ? "Join today to start outsourcing your edits." 
                : "Access your projects, upload footage, and manage your edits."}
            </p>

            <div className="space-y-4">
              <button className="w-full flex items-center justify-center gap-3 rounded-lg py-3 font-medium bg-[#DB4437] text-white">
                <img src="/icons/google-flat-white.svg" alt="Google" className="h-5 w-5" />
                Continue with Google
              </button>
            </div>

            <div className="mt-6 mb-4 flex items-center gap-3">
              <div className="h-px bg-gray-200 flex-1" />
              <div className="text-sm text-gray-400">or</div>
              <div className="h-px bg-gray-200 flex-1" />
            </div>

            {actionData?.error && (
              <div className="mb-4 rounded-lg bg-red-100 p-3 text-sm text-red-600 font-medium">
                {actionData.error}
              </div>
            )}

            <Form method="post" className="space-y-4">
              {/* Hidden input to decide whether to sign in or sign up */}
              <input type="hidden" name="intent" value={isSignUp ? "signup" : "signin"} />
              
              {isSignUp && (
                <label className="block">
                  <span className="text-sm font-medium text-gray-700">Full Name</span>
                  <input name="name" type="text" required className="mt-1 block w-full rounded-lg border border-gray-200 px-4 py-3 focus:ring-2 focus:ring-red-500 outline-none" />
                </label>
              )}
              <label className="block">
                <span className="text-sm font-medium text-gray-700">Email</span>
                <input name="email" type="email" required className="mt-1 block w-full rounded-lg border border-gray-200 px-4 py-3 focus:ring-2 focus:ring-red-500 outline-none" />
              </label>
              <label className="block relative">
                <span className="text-sm font-medium text-gray-700">Password</span>
                <input 
                  name="password"
                  type={showPassword ? "text" : "password"} 
                  required 
                  className="mt-1 block w-full rounded-lg border border-gray-200 px-4 py-3 pr-10 focus:ring-2 focus:ring-red-500 outline-none" 
                />
                <button 
                  type="button" 
                  onClick={() => setShowPassword(!showPassword)} 
                  className="absolute right-3 bottom-3"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  <img 
                    src={showPassword ? "/icons/eye-off.svg" : "/icons/eye.svg"} 
                    alt={showPassword ? "Hide" : "Show"} 
                    className="w-5 h-5" 
                  />
                </button>
              </label>

              <div className="flex items-center justify-between">
                <label className="inline-flex items-center gap-2 text-sm text-gray-600">
                  <input type="checkbox" name="remember" className="h-4 w-4" />
                  Remember me
                </label>
                {!isSignUp && (
                  <a href="#" className="text-sm text-red-600 font-medium">Forgot password?</a>
                )}
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#FF0000] to-[#D90000] px-5 py-3 text-sm font-black text-white shadow-lg shadow-red-500/20 [#D90000] [#A80000] disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[20px]">
                  {isSignUp ? "person_add" : "login"}
                </span>
                {isSubmitting ? "Please wait..." : isSignUp ? "Create account" : "Sign in"}
              </button>
            </Form>

            <p className="mt-6 text-center text-sm text-gray-600 font-medium">
              {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
              <button
                type="button"
                onClick={() => setIsSignUp(!isSignUp)}
                className="ml-1 inline-flex items-center gap-1 rounded-full border border-[#FF0000]/15 bg-[#FFF5F5] px-3 py-1.5 font-black text-[#FF0000] [#FFE8E8]"
              >
                <span className="material-symbols-outlined text-[18px]">
                  {isSignUp ? "login" : "person_add"}
                </span>
                {isSignUp ? "Sign in" : "Sign up"}
              </button>
            </p>

            <p className="mt-8 text-center text-xs text-gray-500">
              By continuing you agree to our <a className="text-red-600 font-semibold" href="/terms">Terms</a> and <a className="text-red-600 font-semibold" href="/privacy">Privacy</a>.
            </p>
          </div>
        </section>

        <aside className="hidden md:flex md:w-1/2 items-center justify-center bg-[#FCFCFC] p-12">
          <div className="max-w-sm">
            <img src="/images/hero-suite.png" alt="EdiCut workspace" className="rounded-xl shadow-lg mb-6" />
            <h3 className="text-xl font-semibold mb-2">Fast, intelligent editing</h3>
            <p className="text-gray-600">Upload footage, pick a style, and we'll deliver a polished edit — faster than manual workflows.</p>
          </div>
        </aside>
      </main>
      <Footer />
    </div>
  );
}
