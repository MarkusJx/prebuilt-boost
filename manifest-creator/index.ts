import { Octokit } from "@octokit/core";
import fs from "fs";
import path from "path";

type Platform = "linux" | "windows" | "macos";

interface File {
    filename: string;
    platform: Platform;
    platform_version: string;
    toolset?: string;
    download_url: string;
}

function cmp (a: string, b: string): 0 | 1 | -1 {
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
    const releases = await octokit.request('GET /repos/{owner}/{repo}/releases', {
        owner: 'MarkusJx',
        repo: 'prebuilt-boost'
    });

    const releaseIds = releases.data.map(d => ({
        tag: d.tag_name,
        id: d.id
    })).sort((a, b) => cmp(a.tag, b.tag));

    const versions = await Promise.all(releaseIds.map(async r => {
        const assets = await octokit.request('GET /repos/{owner}/{repo}/releases/{release_id}/assets', {
            owner: 'MarkusJx',
            repo: 'prebuilt-boost',
            release_id: r.id
        });

        const files = assets.data.map(d => {
            const split = d.name.substring(0, d.name.indexOf('.tar.gz')).split('-');

            return {
                filename: d.name,
                platform: split[2].replace('ubuntu', 'linux') as Platform,
                platform_version: split[3],
                toolset: split[4],
                download_url: d.browser_download_url
            };
        });

        return {
            version: r.tag,
            files: files
        };
    }));

    const outFile = path.join(__dirname, '..', 'versions-manifest.json');
    if (fs.existsSync(outFile)) {
        console.log("versions-manifest.json already exists, deleting it");
        fs.unlinkSync(outFile);
    }

    console.log(`Writing results to ${outFile}`);
    fs.writeFileSync(outFile, JSON.stringify(versions, null, 4));
}

main().then().catch(e => {
    console.error(e);
    process.exit(1);
});