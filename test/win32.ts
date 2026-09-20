import { dirname, delimiter } from 'node:path'
import * as fs from 'node:fs'
import * as fsPromises from 'node:fs/promises'
import t from 'tap'
import { isexe, sync } from '../src/win32.js'

import { createFixtures } from './fixtures/index.js'
const { meow, fail, mine, ours, enoent } = createFixtures(t)

const { PATHEXT } = process.env
t.teardown(() => {
  if (PATHEXT) process.env.PATHEXT = PATHEXT
  else delete process.env.PATHEXT
})
process.env.PATHEXT = `.EXE${delimiter}.CAT${delimiter}.CMD${delimiter}.COM`

t.test('basic tests', async t => {
  t.equal(await isexe(meow), true)
  t.equal(await isexe(ours), true)
  t.equal(await isexe(mine), true)
  t.equal(await isexe(fail), false)
  t.equal(await isexe(dirname(meow)), false)

  t.equal(sync(meow), true)
  t.equal(sync(ours), true)
  t.equal(sync(mine), true)
  t.equal(sync(fail), false)
  t.equal(sync(dirname(meow)), false)

  t.rejects(isexe(enoent), { code: 'ENOENT' })
  t.throws(() => sync(enoent), { code: 'ENOENT' })
  t.equal(await isexe(enoent, { ignoreErrors: true }), false)
  t.equal(sync(enoent, { ignoreErrors: true }), false)
})

// no effect on win32 impl
t.test('uid/gid no effect on windows', async t => {
  const opts = { uid: 1, gid: 1 }
  t.equal(await isexe(meow, opts), true)
  t.equal(await isexe(ours, opts), true)
  t.equal(await isexe(mine, opts), true)
  t.equal(await isexe(fail, opts), false)
  t.equal(await isexe(enoent, { ignoreErrors: true, ...opts }), false)

  t.equal(sync(meow, opts), true)
  t.equal(sync(ours, opts), true)
  t.equal(sync(mine, opts), true)
  t.equal(sync(fail, opts), false)
  t.equal(sync(enoent, { ignoreErrors: true, ...opts }), false)
})

t.test('custom pathExt option', async t => {
  const opts = {
    pathExt: `.EXE${delimiter}.COM${delimiter}.CMD${delimiter}.FALSE`,
  }
  t.equal(await isexe(meow, opts), false)
  t.equal(await isexe(ours, opts), false)
  t.equal(await isexe(mine, opts), false)
  t.equal(await isexe(fail, opts), true)

  t.equal(sync(meow, opts), false)
  t.equal(sync(ours, opts), false)
  t.equal(sync(mine, opts), false)
  t.equal(sync(fail, opts), true)
})

t.test('windows app execution aliases', async t => {
  const eacces = Object.assign(new Error('EACCES'), {
    code: 'EACCES',
  }) as NodeJS.ErrnoException
  const eperm = Object.assign(new Error('EPERM'), {
    code: 'EPERM',
  }) as NodeJS.ErrnoException
  const eio = Object.assign(new Error('EIO'), {
    code: 'EIO',
  }) as NodeJS.ErrnoException

  const denied = new Set<string>([meow, fail])

  const { isexe: isexeDenied, sync: syncDenied } = await t.mockImport<
    typeof import('../src/win32.js')
  >('../src/win32.js', {
    'node:fs': {
      ...fs,
      statSync: (path: string) => {
        if (denied.has(path)) throw eacces
        return fs.statSync(path)
      },
    },
    'node:fs/promises': {
      ...fsPromises,
      stat: async (path: string) => {
        if (denied.has(path)) throw eacces
        return fsPromises.stat(path)
      },
    },
  })

  t.equal(await isexeDenied(meow), true, 'EACCES + access + pathext')
  t.equal(syncDenied(meow), true, 'sync EACCES + access + pathext')
  t.equal(
    await isexeDenied(fail),
    false,
    'EACCES + access but extension not executable',
  )
  t.equal(syncDenied(fail), false)

  const { isexe: isexePerm, sync: syncPerm } = await t.mockImport<
    typeof import('../src/win32.js')
  >('../src/win32.js', {
    'node:fs': {
      ...fs,
      statSync: (path: string) => {
        if (path === meow) throw eperm
        return fs.statSync(path)
      },
    },
    'node:fs/promises': {
      ...fsPromises,
      stat: async (path: string) => {
        if (path === meow) throw eperm
        return fsPromises.stat(path)
      },
    },
  })

  t.equal(await isexePerm(meow), true, 'EPERM + access + pathext')
  t.equal(syncPerm(meow), true)

  const missing = meow + '.missing'
  const { isexe: isexeMissing, sync: syncMissing } = await t.mockImport<
    typeof import('../src/win32.js')
  >('../src/win32.js', {
    'node:fs': {
      ...fs,
      statSync: (path: string) => {
        if (path === missing) throw eacces
        return fs.statSync(path)
      },
    },
    'node:fs/promises': {
      ...fsPromises,
      stat: async (path: string) => {
        if (path === missing) throw eacces
        return fsPromises.stat(path)
      },
    },
  })

  t.equal(
    await isexeMissing(missing),
    false,
    'EACCES then access ENOENT is not executable',
  )
  t.equal(syncMissing(missing), false)
  t.equal(await isexeMissing(missing, { ignoreErrors: true }), false)
  t.equal(syncMissing(missing, { ignoreErrors: true }), false)

  const { isexe: isexeIO, sync: syncIO } = await t.mockImport<
    typeof import('../src/win32.js')
  >('../src/win32.js', {
    'node:fs': {
      ...fs,
      statSync: () => {
        throw eio
      },
    },
    'node:fs/promises': {
      ...fsPromises,
      stat: async () => {
        throw eio
      },
    },
  })

  await t.rejects(isexeIO(meow), { code: 'EIO' })
  t.throws(() => syncIO(meow), { code: 'EIO' })
  t.equal(await isexeIO(meow, { ignoreErrors: true }), false)
  t.equal(syncIO(meow, { ignoreErrors: true }), false)

  const { isexe: isexeAccessIO, sync: syncAccessIO } = await t.mockImport<
    typeof import('../src/win32.js')
  >('../src/win32.js', {
    'node:fs': {
      ...fs,
      statSync: () => {
        throw eacces
      },
      accessSync: () => {
        throw eio
      },
    },
    'node:fs/promises': {
      ...fsPromises,
      stat: async () => {
        throw eacces
      },
      access: async () => {
        throw eio
      },
    },
  })

  await t.rejects(isexeAccessIO(meow), { code: 'EIO' })
  t.throws(() => syncAccessIO(meow), { code: 'EIO' })
  t.equal(await isexeAccessIO(meow, { ignoreErrors: true }), false)
  t.equal(syncAccessIO(meow, { ignoreErrors: true }), false)
})

t.test('empty pathext entry means everything executable', async t => {
  delete process.env.PATHEXT
  const opts = {
    pathExt: `.EXE${delimiter}.COM${delimiter}${delimiter}.CMD${delimiter}.ASDF`,
  }
  t.equal(await isexe(meow, opts), true)
  t.equal(await isexe(ours, opts), true)
  t.equal(await isexe(mine, opts), true)
  t.equal(await isexe(fail, opts), true)

  t.equal(sync(meow, opts), true)
  t.equal(sync(ours, opts), true)
  t.equal(sync(mine, opts), true)
  t.equal(sync(fail, opts), true)

  const empty = { pathExt: '' }
  t.equal(await isexe(meow, empty), true)
  t.equal(await isexe(ours, empty), true)
  t.equal(await isexe(mine, empty), true)
  t.equal(await isexe(fail, empty), true)

  t.equal(sync(meow, empty), true)
  t.equal(sync(ours, empty), true)
  t.equal(sync(mine, empty), true)
  t.equal(sync(fail, empty), true)

  t.equal(await isexe(meow), true)
  t.equal(await isexe(ours), true)
  t.equal(await isexe(mine), true)
  t.equal(await isexe(fail), true)

  t.equal(sync(meow), true)
  t.equal(sync(ours), true)
  t.equal(sync(mine), true)
  t.equal(sync(fail), true)
})
