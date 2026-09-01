const requiredVariables = ['DROPBOX_APP_KEY']
const missingVariables = requiredVariables.filter(name => !process.env[name] || !process.env[name].trim())

if (missingVariables.length > 0) {
    console.error(`Missing required build environment variable(s): ${missingVariables.join(', ')}`)
    process.exit(1)
}
