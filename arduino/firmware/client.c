#include <FastLED.h>

#define LED_PIN1 6
#define LED_PIN2 7
#define LED_COUNT_PER_STRIP 150
#define TOTAL_LED_COUNT LED_COUNT_PER_STRIP * 2
#define COLOR_ORDER GRB
#define BAUD_RATE 115200
#define DATA_BLOCK_SIZE 64
#define ACK_BYTE 0xAA
#define BYTES_PER_LED 3
#define NUMBER_OF_BYTES_TO_READ TOTAL_LED_COUNT *BYTES_PER_LED
#define STATUS_INTERVAL 2000 // Milliseconds between sending status updates

CRGB leds1[LED_COUNT_PER_STRIP];
CRGB leds2[LED_COUNT_PER_STRIP];
byte receivedBuffer[DATA_BLOCK_SIZE];
byte ledBuffer[3];
unsigned int ledIndex = 0;
unsigned long receivedBlocks = 0;
unsigned long totalBytesRead = 0;
unsigned long startTime;
unsigned long lastStatusTime = 0;

void setup()
{
    Serial.begin(BAUD_RATE);
    FastLED.addLeds<WS2812B, LED_PIN1, COLOR_ORDER>(leds1, LED_COUNT_PER_STRIP);
    FastLED.addLeds<WS2812B, LED_PIN2, COLOR_ORDER>(leds2, LED_COUNT_PER_STRIP);
    FastLED.setBrightness(255);
    // FastLED.clear();

    // // Initialize both strips to white
    // for (int i = 0; i < LED_COUNT_PER_STRIP; i++)
    // {
    //     leds1[i] = CRGB(255, 255, 255);
    //     leds2[i] = CRGB(255, 255, 255);
    // }
    // FastLED.show();

    Serial.println("Arduino listening for dual strip data...");
    startTime = millis();
    lastStatusTime = startTime;
}

void loop()
{
    // Send status update periodically
    // unsigned long currentTime = millis();
    // if (currentTime - lastStatusTime >= STATUS_INTERVAL)
    // {
    //     Serial.print("Available: ");
    //     Serial.println(Serial.available());
    //     lastStatusTime = currentTime;
    // }

    while (Serial.available() > 0)
    {
        int bytesToRead = min((int)Serial.available(), DATA_BLOCK_SIZE);
        Serial.readBytes(receivedBuffer, bytesToRead);

        for (int i = 0; i < bytesToRead; i++)
        {
            ledBuffer[ledIndex] = receivedBuffer[i];
            ledIndex++;
            if (ledIndex == 3)
            {
                int ledPosition = totalBytesRead / 3;
                if (ledPosition < TOTAL_LED_COUNT)
                {
                    // First half of data goes to first strip
                    if (ledPosition < LED_COUNT_PER_STRIP)
                    {
                        leds1[ledPosition] = CRGB(ledBuffer[0], ledBuffer[1], ledBuffer[2]);
                    }
                    // Second half of data goes to second strip
                    else
                    {
                        leds2[ledPosition - LED_COUNT_PER_STRIP] = CRGB(ledBuffer[0], ledBuffer[1], ledBuffer[2]);
                    }
                }
                ledIndex = 0;
            }
            totalBytesRead++;
        }

        if (totalBytesRead >= NUMBER_OF_BYTES_TO_READ)
        {
            FastLED.show();
            Serial.write(ACK_BYTE);
            receivedBlocks = 0;
            totalBytesRead = 0;
            ledIndex = 0;
        }
    }
}