#!/bin/bash
// >&/dev/null;exec node --harmony-async-await $0 $@
// vi:syntax=javascript

// Packages
const args = require('args')
const chalk = require('chalk')
const semVer = require('semver')
const inquirer = require('inquirer')
const open = require('open')
const taggedVersions = require('tagged-versions')
const updateNotifier = require('update-notifier')

// Ours
const groupChanges = require('../lib/group')
const {branchSynced, getRepo} = require('../lib/repo')
const getCommits = require('../lib/commits')
const getChoices = require('../lib/choices')
const definitions = require('../lib/definitions')
const connect = require('../lib/connect')
const createChangelog = require('../lib/changelog')
const handleSpinner = require('../lib/spinner')
const pkg = require('../package')

args
  .option('pre', 'Mark the release as prerelease')
  .option('overwrite', 'If the release already exists, replace it')

const flags = args.parse(process.argv)

let githubConnection
let repoDetails

const changeTypes = [
  {
    handle: 'major',
    name: 'Breaking changes',
    description: 'incompatible API change'
  },
  {
    handle: 'minor',
    name: 'New features',
    description: 'backwards-compatible functionality'
  },
  {
    handle: 'patch',
    name: 'Bug fixes / generic changes',
    description: 'backwards-compatible bug fix'
  }
]

// Let people know when there's an update
updateNotifier({pkg}).notify()

const getReleaseURL = (release, edit = false) => {
  if (!release || !release.html_url) {
    return false
  }

  const htmlURL = release.html_url
  return edit ? htmlURL.replace('/tag/', '/edit/') : htmlURL
}

const createRelease = (tagName, changelog, exists, releaseName) => {
  const isPre = flags.pre ? 'pre' : ''
  handleSpinner.create(`Uploading ${isPre}release`)

  const methodPrefix = exists ? 'edit' : 'create'
  const method = methodPrefix + 'Release'

  const body = {
    owner: repoDetails.user,
    repo: repoDetails.repo,
    tag_name: tagName,
    body: changelog,
    draft: true,
    prerelease: flags.pre,
    name: releaseName
  }

  if (exists) {
    body.id = exists
  }

  githubConnection.repos[method](body, (err, response) => {
    if (err) {
      console.log('\n')
      handleSpinner.fail('Failed to upload release.')
    }

    global.spinner.succeed()
    const releaseURL = getReleaseURL(response, true)

    if (releaseURL) {
      open(releaseURL)
    }

    console.log(`\n${chalk.bold('Done!')} 🎉 Opening release in browser...`)
  })
}

const orderCommits = (commits, tags, exists) => {
  const commitQuestions = []
  const predefined = {}

  const choices = getChoices(changeTypes, tags)

  // Show the latest changes first
  commits.reverse()

  for (const commit of commits) {
    const defTitle = definitions.type(commit.title, changeTypes)
    const defDescription = definitions.type(commit.description, changeTypes)

    const definition = defTitle || defDescription

    if (definition) {
      predefined[commit.hash] = definition
      continue
    }

    commitQuestions.push({
      name: commit.hash,
      message: commit.title,
      type: 'list',
      choices
    })
  }

  global.spinner.succeed()

  // Prevents the spinner from getting succeeded
  // again once new spinner gets created
  global.spinner = false

  console.log(`${chalk.green('!')} Please enter the type of change for each commit:\n`)

  let releaseName
  let commitTypes
  let overview

  inquirer.prompt({
    type: 'input',
    name: 'releaseName',
    message: 'Release name',
    default: `Release v${tags[0].version}`
  }).then((input) => {
    releaseName = input.releaseName

    return inquirer.prompt(commitQuestions)
  }).then((types) => {
    commitTypes = types

    return inquirer.prompt({
      type: 'editor',
      name: 'overview',
      message: 'Enter a description or bullet-point list that outlines this release.'
    })
  }).then((input) => {
    overview = input.overview

    // Update the spinner status
    console.log('')
    handleSpinner.create('Generating the changelog')

    const results = Object.assign({}, predefined, commitTypes)
    const grouped = groupChanges(results, changeTypes)
    const changelog = createChangelog(grouped, commits, changeTypes, overview)

    // Upload changelog to GitHub Releases
    createRelease(tags[0].version, changelog, exists, releaseName)
  })
}

const collectChanges = (tags, exists = false) => {
  handleSpinner.create('Loading commit history')

  getCommits().then(commits => {
    const lastRelease = tags[1]

    if (!lastRelease) {
      handleSpinner.fail('The first release should be created manually.')
    }

    for (const commit of commits) {
      const index = commits.indexOf(commit)

      if (commit.hash === lastRelease.hash && index > 0) {
        commits = commits.slice(0, index)
        break
      }
    }

    for (const commit of commits) {
      if (semVer.valid(commit.title)) {
        const index = commits.indexOf(commit)
        commits.splice(index, 1)
      }
    }

    if (commits.length < 1) {
      handleSpinner.fail('No changes happened since the last release.')
    }

    orderCommits(commits, tags, exists)
  })
}

const checkReleaseStatus = async () => {
  let tags

  try {
    tags = await taggedVersions.getList()
  } catch (err) {
    handleSpinner.fail('Directory is not a Git repository.')
  }

  if (tags.length < 1) {
    handleSpinner.fail('No tags available for release.')
  }

  if (!await branchSynced()) {
    handleSpinner.fail('Your branch needs to be up-to-date with origin.')
  }

  githubConnection = await connect()
  repoDetails = await getRepo()

  handleSpinner.create('Checking if release already exists')

  githubConnection.repos.getReleases({
    owner: repoDetails.user,
    repo: repoDetails.repo
  }, (err, response) => {
    if (err) {
      handleSpinner.fail(`Couldn't check if release exists.`)
    }

    if (response.length < 1) {
      collectChanges(tags)
      return
    }

    let existingRelease = null

    for (const release of response) {
      if (release.tag_name === tags[0].version) {
        existingRelease = release
        break
      }
    }

    if (!existingRelease) {
      collectChanges(tags)
      return
    }

    if (flags.overwrite) {
      global.spinner.text = 'Overwriting release, because it already exists'
      collectChanges(tags, existingRelease.id)

      return
    }

    global.spinner.succeed()
    console.log('')

    const releaseURL = getReleaseURL(existingRelease)

    if (releaseURL) {
      open(releaseURL)
    }

    const alreadyThere = 'Release already exists. Opening in browser...'
    console.error(`${chalk.red('Error!')} ` + alreadyThere)

    process.exit(1)
  })
}

checkReleaseStatus()
