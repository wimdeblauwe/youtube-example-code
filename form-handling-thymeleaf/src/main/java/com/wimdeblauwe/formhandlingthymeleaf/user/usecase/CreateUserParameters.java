package com.wimdeblauwe.formhandlingthymeleaf.user.usecase;

import org.springframework.util.Assert;

public record CreateUserParameters(String givenName, String familyName) {
    public CreateUserParameters {
        Assert.hasText(givenName, "The CreateUserParameters givenName should have text");
        Assert.hasText(familyName, "The CreateUserParameters familyName should have text");
    }
}
