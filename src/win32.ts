/**
 * This is the Windows implementation of isexe, which uses the file
 * extension and PATHEXT setting.
 *
 * @module
 */

import { Stats, accessSync, constants, statSync } from 'node:fs'
import { access, stat } from 'node:fs/promises'
import { IsexeOptions } from './options.js'
import { delimiter } from 'node:path'

const isDenied = (er: NodeJS.ErrnoException) =>
  er.code === 'EACCES' || er.code === 'EPERM'

/**
 * Determine whether a path is executable based on the file extension
 * and PATHEXT environment variable (or specified pathExt option)
 */
export const isexe = async (
  path: string,
  options: IsexeOptions = {},
): Promise<boolean> => {
  const { ignoreErrors = false } = options
  try {
    return checkStat(await stat(path), path, options)
  } catch (e) {
    const er = e as NodeJS.ErrnoException
    if (isDenied(er)) {
      return checkAccess(path, options, ignoreErrors)
    }
    if (ignoreErrors) return false
    throw er
  }
}

/**
 * Synchronously determine whether a path is executable based on the
 * file extension and PATHEXT environment variable (or specified
 * pathExt option)
 */
export const sync = (
  path: string,
  options: IsexeOptions = {},
): boolean => {
  const { ignoreErrors = false } = options
  try {
    return checkStat(statSync(path), path, options)
  } catch (e) {
    const er = e as NodeJS.ErrnoException
    if (isDenied(er)) {
      return checkAccessSync(path, options, ignoreErrors)
    }
    if (ignoreErrors) return false
    throw er
  }
}

const checkPathExt = (path: string, options: IsexeOptions) => {
  const { pathExt = process.env.PATHEXT || '' } = options
  const peSplit = pathExt.split(delimiter)
  if (peSplit.indexOf('') !== -1) {
    return true
  }

  for (const pes of peSplit) {
    const p = pes.toLowerCase()
    const ext = path.substring(path.length - p.length).toLowerCase()

    if (p && ext === p) {
      return true
    }
  }
  return false
}

const checkStat = (stat: Stats, path: string, options: IsexeOptions) =>
  stat.isFile() && checkPathExt(path, options)

// Windows App Execution Aliases (e.g. WindowsApps\mspaint.exe) can be
// launched but raise EACCES/EPERM from fs.stat(). fs.access() succeeds;
// treat those as executable when PATHEXT matches.
const checkAccess = async (
  path: string,
  options: IsexeOptions,
  ignoreErrors: boolean,
) => {
  try {
    await access(path, constants.F_OK)
    return checkPathExt(path, options)
  } catch (e) {
    const er = e as NodeJS.ErrnoException
    if (ignoreErrors || isDenied(er) || er.code === 'ENOENT') return false
    throw er
  }
}

const checkAccessSync = (
  path: string,
  options: IsexeOptions,
  ignoreErrors: boolean,
) => {
  try {
    accessSync(path, constants.F_OK)
    return checkPathExt(path, options)
  } catch (e) {
    const er = e as NodeJS.ErrnoException
    if (ignoreErrors || isDenied(er) || er.code === 'ENOENT') return false
    throw er
  }
}
