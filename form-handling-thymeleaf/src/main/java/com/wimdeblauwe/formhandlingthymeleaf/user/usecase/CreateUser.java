package com.wimdeblauwe.formhandlingthymeleaf.user.usecase;

import com.wimdeblauwe.formhandlingthymeleaf.user.User;
import com.wimdeblauwe.formhandlingthymeleaf.user.repository.UserRepository;
import org.springframework.stereotype.Component;

import java.util.UUID;

@Component
public class CreateUser {
    private final UserRepository userRepository;

    public CreateUser(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    public User execute(CreateUserParameters parameters) {
        User user = new User(UUID.randomUUID(), parameters.givenName(), parameters.familyName());
        userRepository.save(user);
        return user;
    }
}
