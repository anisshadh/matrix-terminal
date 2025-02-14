import browserAutomation from './lib/browserAutomation';

async function testBrowserAutomation() {
    try {
        console.log('Starting browser automation test...');
        // First navigate to Google
        let result = await browserAutomation.execute('test-session', {
            actions: [{
                action: 'navigate',
                url: 'https://www.google.com'
            }, {
                action: 'click',
                selector: 'textarea[name="q"]'
            }, {
                action: 'type',
                selector: 'textarea[name="q"]',
                value: 'browser automation test',
                visible: true
            }]
        });
        console.log('Result:', JSON.stringify(result, null, 2));
    } catch (error) {
        console.error('Error:', error);
    } finally {
        // Keep the process alive for a moment to ensure logs are flushed
        await new Promise(resolve => setTimeout(resolve, 1000));
        process.exit(0);
    }
}

testBrowserAutomation();
