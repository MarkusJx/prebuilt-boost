import { Octokit } from '@octokit/core';
import fs from 'fs';
import path from 'path';

type Platform = 'linux' | 'windows' | 'macos';
type PlatformVersion =
    | '18.04'
    | '20.04'
    | '22.04'
    | '2019'
    | '2022'
    | '10.15'
    | '11'
    | '12'
    | '13';
type Toolset = 'gcc' | 'msvc' | 'mingw' | 'clang';
type Arch = 'x86' | 'aarch64' | 'arm64';
type Link = 'static' | 'shared' | 'static+shared';

interface File {
    filename: string;
    platform: Platform;
    platform_version: PlatformVersion;
    toolset?: Toolset;
    arch?: Arch;
    link?: Link;
    download_url: string;
}

const ignoredFileNames: string[] = [
    'boost-1.74.0-windows-2019-no-python.tar.gz',
];

const notIgnoredFile = (file: File) =>
    !ignoredFileNames.includes(file.filename);

const compareTags = (a: string, b: string): 0 | 1 | -1 => {
    var pa = a.split('.');
    var pb = b.split('.');
    for (var i = 0; i < 3; i++) {
        var na = Number(pa[i]);
        var nb = Number(pb[i]);
        if (na > nb) return 1;
        if (nb > na) return -1;
        if (!isNaN(na) && isNaN(nb)) return 1;
        if (isNaN(na) && !isNaN(nb)) return -1;
    }
    return 0;
};

async function main(): Promise<void> {
    const octokit = new Octokit();
    const releases = await octokit.request(
        'GET /repos/{owner}/{repo}/releases',
        {
            owner: 'MarkusJx',
            repo: 'prebuilt-boost',
        }
    );

    const releaseIds = releases.data
        .map((d) => ({
            tag: d.tag_name,
            id: d.id,
        }))
        .sort((a, b) => compareTags(a.tag, b.tag));

    const versions = await Promise.all(
        releaseIds.map(async (r) => {
            const assets = await octokit.request(
                'GET /repos/{owner}/{repo}/releases/{release_id}/assets',
                {
                    owner: 'MarkusJx',
                    repo: 'prebuilt-boost',
                    release_id: r.id,
                }
            );

            const files: File[] = assets.data
                .map<File>((d) => {
                    const split = d.name
                        .substring(0, d.name.indexOf('.tar.gz'))
                        .split('-');

                    return {
                        filename: d.name,
                        platform: split[2].replace(
                            'ubuntu',
                            'linux'
                        ) as Platform,
                        platform_version: split[3] as PlatformVersion,
                        toolset: split[4] as Toolset,
                        link:
                            (split.length >= 6 && (split[5] as Link)) ||
                            undefined,
                        arch:
                            (split.length >= 7 && (split[6] as Arch)) ||
                            undefined,
                        download_url: d.browser_download_url,
                    };
                })
                .filter(notIgnoredFile);

            return {
                version: r.tag,
                files: files,
            };
        })
    );

    const outFile = path.join(__dirname, '..', 'versions-manifest.json');
    if (fs.existsSync(outFile)) {
        console.log('versions-manifest.json already exists, deleting it');
        fs.unlinkSync(outFile);
    }

    console.log(`Writing results to ${outFile}`);
    fs.writeFileSync(outFile, JSON.stringify(versions, null, 4));
}

main()
    .then()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    });
