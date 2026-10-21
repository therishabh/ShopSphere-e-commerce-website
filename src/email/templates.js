// Email ke text templates. Har template { subject, text } deta hai.
//
// Dhyaan: links mein token hota hai. Token sirf is email mein aur user ke browser mein jaata hai: logs, audit events ya
// error responses mein kabhi nahi. Templates plain text hain (HTML nahi) taaki injection ka sawal hi na uthe.

export const verificationEmail = ({ name, link }) => ({
  subject: 'Verify your ShopSphere email',
  text: `Hi ${name},\n\nConfirm your email address to activate your account:\n${link}\n\nThis link works once and expires in 24 hours. If you did not sign up, ignore this email.\n`,
});

export const passwordResetEmail = ({ name, link }) => ({
  subject: 'Reset your ShopSphere password',
  text: `Hi ${name},\n\nUse this link to choose a new password:\n${link}\n\nThis link works once and expires in 1 hour. If you did not ask for this, you can ignore this email; your password has not changed.\n`,
});

export const passwordChangedEmail = ({ name }) => ({
  subject: 'Your ShopSphere password was changed',
  text: `Hi ${name},\n\nYour password was just changed and all your sessions were signed out. If this was not you, reset your password immediately.\n`,
});

// Signup par email pehle se registered thi: client ko "exists" nahi bataya jaata (enumeration), balki asli maalik ko email jaata hai.
export const alreadyRegisteredEmail = ({ name }) => ({
  subject: 'Someone tried to sign up with your email',
  text: `Hi ${name},\n\nSomeone tried to create a ShopSphere account with this email address, but you already have one. If it was you, just log in (or reset your password). If not, no action is needed.\n`,
});
