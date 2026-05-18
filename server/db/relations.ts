import { relations } from 'drizzle-orm'
import { sans, sanSshCredentials, sanSettings, clusters } from './schema'

export const clustersRelations = relations(clusters, ({ many }) => ({
  sans: many(sans),
}))

export const sansRelations = relations(sans, ({ one, many }) => ({
  cluster: one(clusters, {
    fields: [sans.clusterId],
    references: [clusters.id],
  }),
  credentials: one(sanSshCredentials, {
    fields: [sans.id],
    references: [sanSshCredentials.sanId],
  }),
  settings: many(sanSettings),
}))

export const credentialsRelations = relations(sanSshCredentials, ({ one }) => ({
  san: one(sans, {
    fields: [sanSshCredentials.sanId],
    references: [sans.id],
  }),
}))

export const settingsRelations = relations(sanSettings, ({ one }) => ({
  san: one(sans, {
    fields: [sanSettings.sanId],
    references: [sans.id],
  }),
}))
