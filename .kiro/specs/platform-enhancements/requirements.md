# Requirements Document

## Introduction

This document specifies requirements for a set of platform enhancements to DWCode, a DataWeave coding practice platform built with Next.js, MongoDB, and Clerk authentication. The enhancements cover: a bug fix to submission status evaluation, role-based access control, open problem creation, a blogs section, admin user management, a coins/points system, and a store page (beta UI shell).

## Glossary

- **DWCode**: The DataWeave coding practice platform.
- **Workspace**: The problem-solving page at `/problems/[slug]` containing the editor and console.
- **Execute_API**: The `/api/execute` route that compiles and runs DataWeave code against the backend.
- **Submission_Service**: The `/api/submissions` route that persists submission records.
- **Problem**: A MongoDB document in the `Problem` collection with `testCases` and `hiddenTestCases` arrays, each containing `{ input, expectedOutput }`.
- **Submission**: A MongoDB document in the `Submission` collection with a `status` field of `"Accepted"`, `"Attempted"`, or `"Error"`.
- **Super_Admin**: The single designated platform owner identified by the Clerk user ID stored in the `SUPER_ADMIN_USER_ID` environment variable.
- **Admin**: A user with `role: 'admin'` in the `UserRole` collection, granted by the Super_Admin.
- **UserRole**: A MongoDB model `{ userId, role: 'admin' | 'user', grantedBy, createdAt }`.
- **UserCoins**: A MongoDB model `{ userId, balance, transactions: [{ type, amount, description, createdAt }] }`.
- **Blog**: A MongoDB document `{ title, slug, content (markdown), authorId, authorName, authorImageUrl, tags[], published, createdAt, updatedAt }`.
- **Signed_In_User**: Any user authenticated via Clerk.
- **Output_Normalizer**: A utility function that strips trailing whitespace and normalizes line endings for comparison purposes.
- **GEMINI_API_KEY**: Environment variable holding the server-side Gemini API key (used in current admin AI generation).
- **User_Gemini_Key**: A Gemini API key supplied by a signed-in user per-request for AI-assisted problem generation on the public create page; it is never persisted.

---

## Requirements

### Requirement 1: Submission Status Bug Fix

**User Story:** As a user solving a problem, I want the submission to be marked "Accepted" only when my output actually matches the expected output, so that I receive accurate feedback on my solutions.

#### Acceptance Criteria

1. WHEN a user clicks Submit in the Workspace, THE Submission_Service SHALL execute the user's code against all `testCases` defined on the Problem using the Execute_API.
2. WHEN all test case outputs match their corresponding `expectedOutput` values (after normalization), THE Submission_Service SHALL set the submission `status` to `"Accepted"`.
3. WHEN any test case output does not match its `expectedOutput`, THE Submission_Service SHALL set the submission `status` to `"Attempted"` and SHALL NOT mark the submission as `"Accepted"`.
4. WHEN the Execute_API returns `success: false` for any test case, THE Submission_Service SHALL set the submission `status` to `"Error"`. Error status takes precedence over output mismatch.
5. THE Output_Normalizer SHALL trim leading and trailing whitespace and normalize line endings before comparing actual output to expected output.
6. WHEN a Problem has no `testCases` defined, THE Submission_Service SHALL fall back to comparing the output against the first example's `output` field; if that is also absent, THE Submission_Service SHALL set status to `"Attempted"`.
7. WHEN a user clicks Run (not Submit), THE Workspace SHALL execute code against the custom input panel only and SHALL NOT record a submission.

---

### Requirement 2: Role-Based Access Control

**User Story:** As the Super_Admin, I want to control who can access the admin panel and grant or revoke admin roles to other users, so that platform management is secure and delegated.

#### Acceptance Criteria

1. WHEN any request is made to `/admin` or any `/admin/*` route, THE System SHALL verify the requesting user's Clerk user ID against the `SUPER_ADMIN_USER_ID` environment variable and against the `UserRole` collection.
2. WHEN the requesting user is neither the Super_Admin nor has `role: 'admin'` in UserRole, THE System SHALL return a 403 response and redirect the user to the home page.
3. WHEN the Super_Admin accesses `/admin/users`, THE System SHALL display all current admins with options to revoke their role.
4. WHEN the Super_Admin grants admin to a user, THE System SHALL create a `UserRole` document with `{ userId, role: 'admin', grantedBy: superAdminUserId, createdAt }`.
5. WHEN the Super_Admin revokes admin from a user, THE System SHALL delete the corresponding `UserRole` document.
6. WHEN a user with `role: 'admin'` (but not Super_Admin) accesses `/admin`, THE System SHALL allow access to problem management features but SHALL NOT display user role management controls.
6a. WHEN a user without the admin role or Super_Admin status attempts to access any `/admin` or `/admin/*` route, THE System SHALL explicitly block access with a 403 response and redirect to the home page.
7. THE System SHALL expose the Super_Admin check only server-side and SHALL NOT expose `SUPER_ADMIN_USER_ID` to the client.
8. WHEN an unauthenticated user attempts to access `/admin`, THE System SHALL redirect them to the sign-in page.

---

### Requirement 3: Open Problem Creation

**User Story:** As a signed-in user, I want to create and publish DataWeave problems from a dedicated create page, so that the community can grow the problem set without needing admin access.

#### Acceptance Criteria

1. THE System SHALL provide a `/create` page accessible to all Signed_In_Users for creating new problems manually.
2. WHEN an unauthenticated user visits `/create`, THE System SHALL redirect them to the sign-in page.
3. WHEN a Signed_In_User submits the problem form on `/create` with a non-empty title, non-empty description, and a selected difficulty, THE System SHALL create a Problem document and associate it with the user's `userId` as the `createdBy` field. All other form fields are optional.
4. THE `/create` page SHALL include a form with fields: title (required), description (required), difficulty (required, Easy/Medium/Hard), example input, example expected output, tags, starter code, and optional solution.
5. WHEN a Signed_In_User supplies a `User_Gemini_Key` in the AI generation form on `/create`, THE System SHALL use that key for a single Gemini request to generate a problem and SHALL discard the key immediately after the request completes.
6. THE System SHALL NOT store the `User_Gemini_Key` in any database, log, or session.
7. IF the `User_Gemini_Key` is invalid or the Gemini request fails, THEN THE System SHALL display a descriptive error message to the user.
8. WHEN a problem is successfully created on `/create`, THE System SHALL award the creator 2 coins as a "Problem Created" transaction (see Requirement 6).
9. THE admin panel's "Add Question Manually" and AI Generate sections SHALL remain in `/admin` for admins, in addition to the public `/create` page.

---

### Requirement 4: Blogs Section

**User Story:** As a signed-in user, I want to write and read blog posts about DataWeave and MuleSoft topics, so that the community can share knowledge.

#### Acceptance Criteria

1. THE System SHALL provide a `/blog` page that lists all published Blog documents sorted by `createdAt` descending.
2. WHEN a user visits `/blog`, THE System SHALL display each post's title, author name, author image, tags, and publication date.
3. THE System SHALL provide a `/blog/[slug]` page that renders the full markdown `content` of a Blog document as HTML.
4. WHEN a Signed_In_User submits the "New Post" form with a non-empty title and content, THE System SHALL create a Blog document with `{ title, slug (auto-generated from title), content, authorId, authorName, authorImageUrl, tags, published: true, createdAt, updatedAt }`.
5. WHEN a Signed_In_User creates a blog post, THE System SHALL award them 2 coins as a "Blog Post Published" transaction.
6. WHEN an unauthenticated user attempts to create a blog post, THE System SHALL return a 401 response.
7. WHEN an Admin or Super_Admin deletes a blog post via the API, THE System SHALL permanently remove the Blog document.
8. WHEN a non-admin Signed_In_User attempts to delete a post that is not their own, THE System SHALL return a 403 response.
9. THE System SHALL auto-generate a unique URL-safe `slug` from the post title by lowercasing, replacing non-alphanumeric characters with hyphens, and appending a short unique suffix if a slug collision exists.
10. WHILE a blog post page is rendered, THE System SHALL display a comments/discussion section using the existing `Comments` component pattern.

---

### Requirement 5: Admin User Management

**User Story:** As a Super_Admin or Admin, I want to view all platform users and their activity stats, and manage admin roles, so that I can monitor engagement and delegate moderation.

#### Acceptance Criteria

1. THE System SHALL provide an `/admin/users` page accessible only to Super_Admin and Admins (per Requirement 2).
2. WHEN `/admin/users` loads, THE System SHALL aggregate users from the `Submission` and `Comment` collections (distinct `userId` values) and display them in a table.
3. FOR each user in the table, THE System SHALL display: Clerk user ID, display name, solved count (distinct accepted submissions), total submission count, comment count, and account join date (earliest `createdAt` in submissions or comments).
4. WHEN the Super_Admin is viewing `/admin/users`, THE System SHALL show a "Grant Admin" button for users without the admin role and a "Revoke Admin" button for users with the admin role.
5. WHEN the Super_Admin grants admin to a user from the `/admin/users` table, THE System SHALL create the `UserRole` document as specified in Requirement 2.4.
6. WHEN the Super_Admin revokes admin from a user from the `/admin/users` table, THE System SHALL delete the `UserRole` document as specified in Requirement 2.5.
7. WHEN a regular Admin (not Super_Admin) views `/admin/users`, THE System SHALL display the table but SHALL NOT show grant/revoke controls.

---

### Requirement 6: Coins/Points System

**User Story:** As a user, I want to earn coins for my activity on the platform, so that my engagement is rewarded and visible on my profile and the navbar.

#### Acceptance Criteria

1. THE System SHALL maintain a `UserCoins` document per user with `{ userId, balance, transactions: [{ type, amount, description, createdAt }] }`.
2. WHEN a Signed_In_User solves a problem for the first time (first `"Accepted"` submission for that `problemId`), THE System SHALL award +10 coins with type `"first_solve"`.
3. WHEN a Signed_In_User receives an `"Accepted"` submission (including first solve), THE System SHALL award difficulty coins: +5 for Easy, +10 for Medium, +20 for Hard, with type `"difficulty_bonus"`.
4. WHEN a Signed_In_User publishes a blog post, THE System SHALL award +2 coins with type `"blog_post"`.
5. WHEN a Signed_In_User posts a comment, THE System SHALL award +1 coin with type `"comment"`.
6. WHEN a Signed_In_User logs in on a calendar day with no prior login that day, THE System SHALL check for a consecutive login streak; IF the streak is 2 or more consecutive days, THEN THE System SHALL award +2 coins with type `"daily_streak"`. First-time logins (streak of 1) SHALL NOT receive streak coins.
7. THE System SHALL expose a `/api/coins` GET endpoint that returns the authenticated user's current `balance` and last 20 `transactions`.
8. THE Navbar SHALL display the authenticated user's coin balance as a styled badge next to the user controls.
9. THE Profile page SHALL display the user's total coin balance and a transaction history list.
10. WHEN coin award operations fail (e.g., database error), THE System SHALL log the error but SHALL NOT block the primary action (submission save, comment save, etc.).
11. IF a Signed_In_User has no `UserCoins` document yet, THEN THE System SHALL create one with `balance: 0` before applying any transaction. IF the subsequent coin award operation fails, THE System SHALL preserve the `balance: 0` and log the error.

---

### Requirement 7: Store Page (Beta Shell)

**User Story:** As a user, I want to see a store page that previews upcoming purchasable items, so that I am aware of planned features even while the store is not yet functional.

#### Acceptance Criteria

1. THE System SHALL provide a `/store` page accessible to all users (authenticated or not).
2. WHEN a user visits `/store`, THE System SHALL display a prominent banner with the text "Beta — store coming soon".
3. THE `/store` page SHALL display a grid of placeholder store items, each with a name, description, icon/image, coin cost, and a "Coming Soon" badge.
4. THE `/store` page SHALL NOT implement any purchase, checkout, payment, or item redemption functionality, regardless of item cost.
5. THE Navbar SHALL include a "Store" link in the navigation.
