/** @type {import('next').NextConfig} */
const nextConfig = {
    images: {
        remotePatterns: [
            {
                protocol: 'https',
                hostname: 'vfuedgrheyncotoxseos.supabase.co',
                port: '',
                pathname: '/storage/v1/object/public/**',
            },
        ],
    },

    async headers() {
        return [
            {
                // Apply to every route
                source: '/(.*)',
                headers: [
                    { key: 'Access-Control-Allow-Origin', value: '*' },
                    { key: 'Access-Control-Allow-Methods', value: 'GET,POST,PUT,PATCH,DELETE,OPTIONS' },
                    { key: 'Access-Control-Allow-Headers', value: '*' },
                ],
            },
        ];
    },
};

module.exports = nextConfig;
