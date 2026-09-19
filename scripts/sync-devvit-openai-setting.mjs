import {
  createAppClient,
  createAppSettingsClient,
} from '../node_modules/@devvit/cli/dist/util/clientGenerators.js'
import {getAppBySlug} from '../node_modules/@devvit/cli/dist/util/getAppBySlug.js'
import {FormFieldType} from '../node_modules/@devvit/protos/json/devvit/ui/form_builder/v1alpha/type.js'

const appSlug = 'raeburn-social-os'
const openAiApiKey = process.env.OPENAI_API_KEY?.trim()

if (!process.env.DEVVIT_AUTH_TOKEN || !openAiApiKey) {
  console.error('Required deployment credentials are not configured.')
  process.exit(1)
}

try {
  const appInfo = await getAppBySlug(createAppClient(), {
    slug: appSlug,
    hidePrereleaseVersions: true,
    limit: 0,
  })
  if (!appInfo?.app?.id) throw new Error('app not found')

  const settingsClient = createAppSettingsClient()
  const current = await settingsClient.GetSettings({appId: appInfo.app.id})
  const result = await settingsClient.UpdateSettings({
    appId: appInfo.app.id,
    settings: {
      version: current.settings?.version ?? '',
      settings: {
        ...current.settings?.settings,
        'openai-api-key': {
          fieldType: FormFieldType.STRING,
          stringValue: openAiApiKey,
        },
      },
    },
  })

  if (!result.success) throw new Error('settings update rejected')
  console.log('Devvit OpenAI setting updated successfully.')
} catch {
  console.error('Unable to update the Devvit OpenAI setting.')
  process.exitCode = 1
}
