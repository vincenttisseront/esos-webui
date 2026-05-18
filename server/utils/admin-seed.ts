import { countUsers, createUser } from '../db/repositories/user.repository'
import { generatePassword } from './password'

/**
 * Crée le compte `admin` au premier démarrage si aucun utilisateur
 * n'existe en BDD (cf. SDD v2.1 §8). Affiche les credentials une seule
 * fois dans les logs serveur.
 */
export async function seedAdminIfNeeded(): Promise<void> {
  const count = await countUsers()
  if (count > 0) return

  const username = 'admin'
  const password = generatePassword(16)

  await createUser({
    username,
    password,
    role: 'admin',
    forcePasswordChange: true,
  })

  console.log('')
  console.log('╔══════════════════════════════════════════════════════════╗')
  console.log('║           ESOS WebUI — PREMIER DÉMARRAGE                 ║')
  console.log('║                                                          ║')
  console.log(`║  Utilisateur  : ${username.padEnd(40)} ║`)
  console.log(`║  Mot de passe : ${password.padEnd(40)} ║`)
  console.log('║                                                          ║')
  console.log('║  ⚠️  Changez ce mot de passe dès la première connexion ! ║')
  console.log('╚══════════════════════════════════════════════════════════╝')
  console.log('')
}
